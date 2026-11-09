"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { customerService } from "../server/services/customer.service.ts";
import {
  updateCustomerSchema,
  customerAddressSchema,
  deleteCustomerAddressSchema,
  addCustomerNoteSchema,
  deleteCustomerNoteSchema,
  getCustomerActivityFeedSchema,
} from "../server/validation/customers.ts";

/**
 * Server Action: Update customer details and administrative notes.
 * Strictly requires administrator privileges.
 */
export const updateCustomerAction = createSafeAction(
  {
    schema: updateCustomerSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await customerService.updateCustomer(input, admin);
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.id}`);
    return updated;
  }
);

/**
 * Server Action: Add or update customer address.
 * Strictly requires administrator privileges.
 */
export const saveCustomerAddressAction = createSafeAction(
  {
    schema: customerAddressSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const address = await customerService.saveAddress(input, admin);
    revalidatePath(`/customers/${input.customerId}`);
    return address;
  }
);

/**
 * Server Action: Delete customer address.
 * Strictly requires administrator privileges.
 */
export const deleteCustomerAddressAction = createSafeAction(
  {
    schema: deleteCustomerAddressSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const success = await customerService.deleteAddress(input, admin);
    revalidatePath(`/customers/${input.customerId}`);
    return success;
  }
);

/**
 * Server Action: Add customer administrative note.
 * Strictly requires administrator privileges.
 */
export const addCustomerNoteAction = createSafeAction(
  {
    schema: addCustomerNoteSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const note = await customerService.addNote(
      input.customerId,
      input.body,
      admin,
      input.isPinned ?? false
    );
    revalidatePath(`/customers/${input.customerId}`);
    return note;
  }
);

/**
 * Server Action: Delete customer administrative note (soft delete).
 * Strictly requires super administrator privileges.
 */
export const deleteCustomerNoteAction = createSafeAction(
  {
    schema: deleteCustomerNoteSchema,
    requiredRole: "super_admin",
  },
  async ({ input, admin }) => {
    const success = await customerService.deleteNote(input.id, admin);
    revalidatePath(`/customers/${input.customerId}`);
    return success;
  }
);

/**
 * Server Action: Get unified customer activity timeline (ECOM-010).
 * Requires staff privileges.
 */
export const getCustomerActivityFeedAction = createSafeAction(
  {
    schema: getCustomerActivityFeedSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const beforeDate = input.before ? new Date(input.before) : undefined;
    const feed = await customerService.getActivityFeed(
      input.customerId,
      admin,
      input.limit,
      beforeDate
    );
    return feed;
  }
);
