import { db } from "../../db/index.ts";
import {
  customerRepository,
  CustomerRepository,
  type CustomerListItem,
  type CustomerDetail,
  type CustomerDetailNote,
} from "../repositories/customer.repository.ts";
import type { DatabaseExecutor } from "../repositories/base.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError } from "../errors.ts";
import type {
  CustomerFilterInput,
  UpdateCustomerInput,
  CustomerAddressInput,
  DeleteCustomerAddressInput,
} from "../validation/customers.ts";
import type { PaginatedResult } from "../types.ts";
import type { Address, Customer, CustomerNote } from "../../db/schema/index.ts";

export class CustomerService {
  private readonly repo: CustomerRepository;

  constructor(repo: CustomerRepository = customerRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves filtered, paginated customers list with order count and spend stats.
   * Requires at least staff role.
   */
  async getCustomers(
    filter: CustomerFilterInput,
    admin: AdminContext
  ): Promise<PaginatedResult<CustomerListItem>> {
    assertRole(admin, ["staff"]);
    return this.repo.findPaginated(filter);
  }

  /**
   * Retrieves single deep customer profile with addresses and order history.
   * Requires at least staff role.
   */
  async getCustomerById(id: string, admin: AdminContext): Promise<CustomerDetail> {
    assertRole(admin, ["staff"]);
    const customer = await this.repo.findById(id);
    if (!customer) {
      throw new NotFoundError("Customer", id);
    }
    return customer;
  }

  /**
   * Updates customer contact information or administrative notes.
   * Requires administrator role.
   */
  async updateCustomer(
    input: UpdateCustomerInput,
    admin: AdminContext
  ): Promise<Customer> {
    assertRole(admin, ["admin"]);
    const updated = await this.repo.update(input.id, input);
    if (!updated) {
      throw new NotFoundError("Customer", input.id);
    }
    return updated;
  }

  /**
   * Atomically finds or creates customer by email during order placement.
   * Internal trusted service method.
   */
  async findOrCreateCustomer(
    data: {
      email: string;
      userId?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      notes?: string | null;
    },
    executor: DatabaseExecutor = db
  ): Promise<Customer> {
    return this.repo.upsertCustomer(data, executor);
  }

  /**
   * Adds or updates a customer address.
   * Requires administrator role.
   */
  async saveAddress(
    input: CustomerAddressInput,
    admin: AdminContext
  ): Promise<Address> {
    assertRole(admin, ["admin"]);
    if (input.id) {
      const updated = await this.repo.updateAddress(input.id, input.customerId, {
        label: input.label,
        fullName: input.fullName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        country: input.country,
        isDefault: input.isDefault,
      });
      if (!updated) {
        throw new NotFoundError("Customer address", input.id);
      }
      return updated;
    }

    return this.repo.addAddress({
      customerId: input.customerId,
      label: input.label || null,
      fullName: input.fullName,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null,
      city: input.city,
      province: input.province || null,
      postalCode: input.postalCode || null,
      country: input.country || "PK",
      isDefault: input.isDefault || false,
    });
  }

  /**
   * Deletes a customer address.
   * Requires administrator role.
   */
  async deleteAddress(
    input: DeleteCustomerAddressInput,
    admin: AdminContext
  ): Promise<boolean> {
    assertRole(admin, ["admin"]);
    const deleted = await this.repo.deleteAddress(input.addressId, input.customerId);
    if (!deleted) {
      throw new NotFoundError("Customer address", input.addressId);
    }
    return true;
  }

  /**
   * Appends an audit-tracked administrative staff note to a customer.
   * Requires administrator role.
   */
  async addNote(
    customerId: string,
    body: string,
    admin: AdminContext,
    isPinned: boolean = false
  ): Promise<CustomerNote> {
    assertRole(admin, ["admin"]);
    const customer = await this.repo.findById(customerId);
    if (!customer) {
      throw new NotFoundError("Customer", customerId);
    }
    return this.repo.addNote(customerId, body, admin.id, isPinned);
  }

  /**
   * Retrieves all notes for a customer ordered from newest to oldest.
   * Requires at least staff role.
   */
  async listNotes(
    customerId: string,
    admin: AdminContext
  ): Promise<CustomerDetailNote[]> {
    assertRole(admin, ["staff"]);
    return this.repo.listNotes(customerId);
  }

  /**
   * Deletes an administrative note (soft-delete).
   * Requires super_admin role.
   */
  async deleteNote(
    id: string,
    admin: AdminContext
  ): Promise<boolean> {
    assertRole(admin, ["super_admin"]);
    const deleted = await this.repo.deleteNote(id, admin.id);
    if (!deleted) {
      throw new NotFoundError("Customer note", id);
    }
    return true;
  }

  /**
   * ECOM-010: Retrieves unified customer activity timeline.
   * Requires at least staff role.
   */
  async getActivityFeed(
    customerId: string,
    admin: AdminContext,
    limit: number = 50,
    before?: Date
  ) {
    assertRole(admin, ["staff"]);
    return this.repo.getActivityFeed(customerId, limit, before);
  }
}

export const customerService = new CustomerService();
