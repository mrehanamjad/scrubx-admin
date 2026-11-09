import { z } from "zod";
import { uuidSchema } from "./common.ts";

/**
 * Customers Query & Filter Schema
 */
export const customerFilterSchema = z.object({
  q: z.string().trim().optional(),
  isRegistered: z.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "ordersCount", "totalSpend", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CustomerFilterInput = z.infer<typeof customerFilterSchema>;

/**
 * Update Customer Schema (Contact details and internal administrative notes)
 */
export const updateCustomerSchema = z.object({
  id: uuidSchema,
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/**
 * Customer Address Management Schema
 */
export const customerAddressSchema = z.object({
  id: uuidSchema.optional(),
  customerId: uuidSchema,
  label: z.string().trim().max(50).optional().nullable(),
  fullName: z.string().trim().min(1, "Full recipient name is required."),
  phone: z.string().trim().min(7, "Valid contact phone is required."),
  addressLine1: z.string().trim().min(3, "Address line 1 is required."),
  addressLine2: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().min(2, "City is required."),
  province: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().default("PK"),
  isDefault: z.boolean().default(false),
});

export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;

export const deleteCustomerAddressSchema = z.object({
  customerId: uuidSchema,
  addressId: uuidSchema,
});

export type DeleteCustomerAddressInput = z.infer<typeof deleteCustomerAddressSchema>;

/**
 * Customer Note Management Schema
 */
export const addCustomerNoteSchema = z.object({
  customerId: uuidSchema,
  body: z.string().trim().min(1, "Note body cannot be empty.").max(2000, "Note exceeds 2,000 characters."),
  isPinned: z.boolean().optional().default(false),
});

export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>;

export const deleteCustomerNoteSchema = z.object({
  id: uuidSchema,
  customerId: uuidSchema,
});

export type DeleteCustomerNoteInput = z.infer<typeof deleteCustomerNoteSchema>;

export const getCustomerActivityFeedSchema = z.object({
  customerId: uuidSchema,
  limit: z.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime().optional(),
});

export type GetCustomerActivityFeedInput = z.infer<typeof getCustomerActivityFeedSchema>;
