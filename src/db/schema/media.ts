import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baUser } from "./auth.ts";
import { products } from "./catalog.ts";

/**
 * Media Uploads Audit & Orphan Tracking (ECOM-008)
 */
export const mediaUploads = pgTable(
  "media_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    imagekitFileId: text("imagekit_file_id"),
    url: text("url").notNull(),
    folder: text("folder").notNull(),
    uploadedBy: text("uploaded_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_media_uploads_orphans")
      .on(table.createdAt)
      .where(sql`${table.attachedAt} IS NULL AND ${table.deletedAt} IS NULL`),
    index("idx_media_uploads_file_id").on(table.imagekitFileId),
  ]
);
