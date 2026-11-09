"use server";

import { requireStaffContext } from "@/server/auth";
import { imagekit } from "@/lib/imagekit";
import { assertImageBytes } from "@/server/media/validate-image-bytes";
import { toActionError } from "@/server/errors";
import { imageFolderSchema } from "@/server/validation/common";
import { db } from "@/db";
import { mediaUploads, productImages } from "@/db/schema";
import { and, isNull, sql, lt, eq } from "drizzle-orm";
import { createSafeAction } from "@/server/action-client";
import { recordAuditLog } from "@/server/audit";
import { z } from "zod";

// SEC-006: Strictly raster images; SVG excluded to prevent stored XSS
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface ServerUploadResult {
  success: boolean;
  data?: {
    fileId: string;
    url: string;
    thumbnailUrl: string;
    name: string;
    size?: number;
  };
  error?: string;
}

/**
 * Server Action: Upload media asset directly through the Next.js server runtime.
 * Useful for server-side processing or background tasks.
 */
export async function uploadServerMediaAction(
  formData: FormData,
  folder: string = "/scrubx/products"
): Promise<ServerUploadResult> {
  try {
    // 1. Authorize user (ARCH-001: unified server/auth, no redirects from actions)
    const admin = await requireStaffContext({ redirect: false });

    // Validate destination folder (SEC-005)
    const parsedFolder = imageFolderSchema.safeParse(folder);
    if (!parsedFolder.success) {
      return { success: false, error: "Invalid upload destination folder." };
    }

    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string") {
      return { success: false, error: "No valid file payload received." };
    }

    // 2. Validate declared MIME type (SEC-006)
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `Unsupported file type '${file.type}'. Allowed formats: JPEG, PNG, WebP, AVIF.`,
      };
    }

    // 3. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 5MB limit.`,
      };
    }

    // 4. Validate binary magic bytes signature (SEC-007)
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    assertImageBytes(bytes, file.type);

    // 5. Sanitize and prepare file name
    const sanitizedName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .replace(/-+/g, "-");
    const fileName = `${Date.now()}-${sanitizedName}`;
    const buffer = Buffer.from(arrayBuffer);

    // 6. Upload via ImageKit SDK
    const uploadRes = await imagekit.upload({
      file: buffer,
      fileName,
      folder: parsedFolder.data,
      useUniqueFileName: true,
    });

    // Record upload audit row (ECOM-008)
    try {
      await db.insert(mediaUploads).values({
        imagekitFileId: uploadRes.fileId,
        url: uploadRes.url,
        folder: parsedFolder.data,
        uploadedBy: admin.id,
      });
    } catch {
      // Non-fatal if upload row logging encounters transient issue
    }

    return {
      success: true,
      data: {
        fileId: uploadRes.fileId,
        url: uploadRes.url,
        thumbnailUrl: uploadRes.thumbnailUrl,
        name: uploadRes.name,
        size: uploadRes.size,
      },
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "digest" in err && String((err as any).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    const serialized = toActionError(err);
    console.error("[uploadServerMediaAction Error]:", serialized.error);
    return { success: false, error: serialized.error };
  }
}

/**
 * Server Action: Explicitly record a client direct upload in media_uploads audit table.
 * Requires at least staff role.
 */
export const recordMediaUploadAction = createSafeAction(
  {
    schema: z.object({
      fileId: z.string().trim().min(1),
      url: z.string().trim().url(),
      folder: z.string().trim().default("/scrubx/products"),
    }),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        imagekitFileId: input.fileId,
        url: input.url,
        folder: input.folder,
        uploadedBy: admin.id,
      })
      .returning();
    return row;
  }
);

/**
 * Server Action: Query orphaned media assets older than N days (ECOM-008).
 * Strictly requires super_admin role.
 */
export const listOrphanMediaAction = createSafeAction(
  {
    schema: z.object({
      olderThanDays: z.number().int().min(1).max(365).default(7),
    }),
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const cutoff = new Date(Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000);

    const orphans = await db
      .select({
        id: mediaUploads.id,
        imagekitFileId: mediaUploads.imagekitFileId,
        url: mediaUploads.url,
        folder: mediaUploads.folder,
        createdAt: mediaUploads.createdAt,
      })
      .from(mediaUploads)
      .where(
        and(
          isNull(mediaUploads.attachedAt),
          isNull(mediaUploads.deletedAt),
          lt(mediaUploads.createdAt, cutoff),
          sql`${mediaUploads.imagekitFileId} NOT IN (
            SELECT imagekit_file_id FROM product_images WHERE imagekit_file_id IS NOT NULL
          )`
        )
      )
      .orderBy(mediaUploads.createdAt);

    return {
      count: orphans.length,
      olderThanDays: input.olderThanDays,
      orphans,
    };
  }
);

/**
 * Server Action: Clean up orphaned media assets from ImageKit (ECOM-008).
 * Supports safe dry-run mode and requires super_admin role.
 */
export const cleanupOrphanMediaAction = createSafeAction(
  {
    schema: z.object({
      confirm: z.boolean().default(false),
      olderThanDays: z.number().int().min(1).max(365).default(7),
    }),
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const cutoff = new Date(Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000);

    const orphans = await db
      .select({
        id: mediaUploads.id,
        imagekitFileId: mediaUploads.imagekitFileId,
        url: mediaUploads.url,
      })
      .from(mediaUploads)
      .where(
        and(
          isNull(mediaUploads.attachedAt),
          isNull(mediaUploads.deletedAt),
          lt(mediaUploads.createdAt, cutoff),
          sql`${mediaUploads.imagekitFileId} NOT IN (
            SELECT imagekit_file_id FROM product_images WHERE imagekit_file_id IS NOT NULL
          )`
        )
      )
      .limit(100);

    if (!input.confirm) {
      return {
        dryRun: true,
        count: orphans.length,
        message: `Dry run complete. ${orphans.length} orphaned asset(s) ready for deletion. Pass confirm: true to proceed.`,
        candidates: orphans.map((o) => ({ id: o.id, fileId: o.imagekitFileId })),
      };
    }

    let deletedCount = 0;
    const errors: { id: string; error: string }[] = [];

    for (const item of orphans) {
      try {
        if (item.imagekitFileId) {
          await imagekit.deleteFile(item.imagekitFileId).catch((err: any) => {
            if (err?.message?.includes("404") || err?.status === 404) {
              // Already gone from CDN
              return;
            }
            throw err;
          });
        }

        await db
          .update(mediaUploads)
          .set({ deletedAt: new Date() })
          .where(eq(mediaUploads.id, item.id));

        deletedCount++;
      } catch (err: any) {
        errors.push({ id: item.id, error: err.message || "Failed to delete" });
      }
    }

    await recordAuditLog({
      admin,
      action: "media.orphans_cleaned",
      entityType: "media_uploads",
      after: {
        deletedCount,
        errorsCount: errors.length,
      },
    });

    return {
      dryRun: false,
      deletedCount,
      errors,
    };
  }
);


