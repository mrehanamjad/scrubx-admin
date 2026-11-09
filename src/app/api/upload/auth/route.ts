import { NextResponse, type NextRequest } from "next/server";
import { imagekit } from "@/lib/imagekit";
import { requireStaffContext } from "@/server/auth";
import { AuthenticationError, AuthorizationError } from "@/server/errors";
import { imageFolderSchema } from "@/server/validation/common";
import { checkRateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/upload/auth
 * Generates secure, short-lived authentication parameters for client-side ImageKit uploads.
 * Strictly restricted to authenticated staff and administrators with server-validated folders.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate & Authorize Staff Principal (SEC-004 / SEC-005 / ARCH-001)
    let admin;
    try {
      admin = await requireStaffContext({ redirect: false });
    } catch (err) {
      if (err instanceof AuthenticationError) {
        return NextResponse.json(
          { error: "Unauthorized: Active staff authentication required." },
          { status: 401 }
        );
      }
      if (err instanceof AuthorizationError) {
        return NextResponse.json(
          { error: "Forbidden: Administrative access required." },
          { status: 403 }
        );
      }
      throw err;
    }

    // 2. Rate Limiting: 30 signature requests per 10 minutes per staff user (SEC-005 / SEC-011)
    const rateLimit = checkRateLimit(`upload-auth:${admin.id}`, 30, 10 * 60 * 1000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 30 uploads per 10-minute window." },
        { status: 429 }
      );
    }

    // 3. Capability Binding & Destination Folder Validation (SEC-005)
    const { searchParams } = request.nextUrl;
    const requestedFolder = searchParams.get("folder") || "/scrubx/products";

    const parsedFolder = imageFolderSchema.safeParse(requestedFolder);
    if (!parsedFolder.success) {
      return NextResponse.json(
        {
          error: "Invalid upload destination folder.",
          details: parsedFolder.error.flatten().formErrors,
        },
        { status: 400 }
      );
    }

    // 4. Generate Short-Lived Ephemeral Token & Signature
    const authParams = imagekit.getAuthenticationParameters();

    // Echo validated folder back to client so direct upload must target this prefix
    return NextResponse.json({
      ...authParams,
      folder: parsedFolder.data,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[ImageKit Auth Error]:", error);
    return NextResponse.json(
      { error: "Failed to generate upload authentication credentials." },
      { status: 500 }
    );
  }
}
