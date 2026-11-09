import { and, desc, asc, eq, sql, ilike, or, isNotNull, isNull, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  customers,
  addresses,
  orders,
  customerNotes,
  baUser,
  type Customer,
  type Address,
  type NewAddress,
  type CustomerNote,
} from "../../db/schema/index.ts";
import { buildPaginatedResult, type DatabaseExecutor } from "./base.repository.ts";
import type { CustomerFilterInput, UpdateCustomerInput } from "../validation/customers.ts";
import type { PaginatedResult } from "../types.ts";

export interface CustomerListItem {
  id: string;
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  ordersCount: number;
  totalSpend: number;
  lastOrderDate: Date | null;
  isRegistered: boolean;
}

export interface CustomerDetailNote {
  id: string;
  customerId: string;
  body: string;
  createdBy: string | null;
  authorName: string | null;
  isPinned: boolean;
  createdAt: Date;
}

export interface ActivityEvent {
  occurredAt: Date;
  type: "order.placed" | "order.status" | "payment.submitted" | "payment.approved" | "payment.rejected" | "note.added";
  title: string;
  detail: string | null;
  link: string;
}

export interface CustomerDetail extends Customer {
  isRegistered: boolean;
  ordersCount: number;
  totalSpend: number;
  addresses: Address[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: string;
    placedAt: Date;
  }[];
  notesTimeline?: CustomerDetailNote[];
}

export class CustomerRepository {
  /**
   * Retrieves paginated customers matching keyword and account type filters.
   */
  async findPaginated(
    filter: CustomerFilterInput,
    executor: DatabaseExecutor = db
  ): Promise<PaginatedResult<CustomerListItem>> {
    const conditions = [];

    if (filter.q) {
      const pattern = `%${filter.q.trim()}%`;
      conditions.push(
        or(
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(customers.email, pattern),
          ilike(customers.phone, pattern)
        )
      );
    }

    if (filter.isRegistered !== undefined) {
      conditions.push(
        filter.isRegistered ? isNotNull(customers.userId) : isNull(customers.userId)
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Total count
    const [totalRow] = await executor
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(customers)
      .where(whereClause);

    const total = totalRow?.count ?? 0;
    const offset = (filter.page - 1) * filter.limit;

    // Dynamic sort
    let sortColumn;
    if (filter.sortBy === "name") {
      sortColumn = customers.firstName;
    } else if (filter.sortBy === "ordersCount") {
      sortColumn = sql`orders_count`;
    } else if (filter.sortBy === "totalSpend") {
      sortColumn = sql`total_spend`;
    } else {
      sortColumn = customers.createdAt;
    }

    const orderExpr = filter.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

    // PERF-004: When sorting by computed aggregates, group across table with limit
    // When sorting by direct customer column (default 'createdAt' or 'name'), page first then aggregate for 20 IDs
    if (filter.sortBy === "ordersCount" || filter.sortBy === "totalSpend") {
      const rows = await executor
        .select({
          id: customers.id,
          userId: customers.userId,
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName,
          phone: customers.phone,
          notes: customers.notes,
          createdAt: customers.createdAt,
          updatedAt: customers.updatedAt,
          ordersCount: sql<number>`cast(count(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.id} else null end) as integer)`.as("orders_count"),
          totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.total} else 0 end), 0) as float)`.as("total_spend"),
          lastOrderDate: sql<Date | null>`max(${orders.placedAt})`,
        })
        .from(customers)
        .leftJoin(orders, eq(customers.id, orders.customerId))
        .where(whereClause)
        .groupBy(customers.id)
        .orderBy(orderExpr)
        .limit(filter.limit)
        .offset(offset);

      const items: CustomerListItem[] = rows.map((r) => ({
        ...r,
        isRegistered: Boolean(r.userId),
      }));

      return buildPaginatedResult(items, total, filter.page, filter.limit);
    }

    // Default fast path: page the customers table directly without full join / group by
    const customerRows = await executor
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(filter.limit)
      .offset(offset);

    if (customerRows.length === 0) {
      return buildPaginatedResult([], total, filter.page, filter.limit);
    }

    const customerIds = customerRows.map((c) => c.id);
    const aggRows = await executor
      .select({
        customerId: orders.customerId,
        ordersCount: sql<number>`cast(count(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.id} else null end) as integer)`,
        totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.total} else 0 end), 0) as float)`,
        lastOrderDate: sql<Date | null>`max(${orders.placedAt})`,
      })
      .from(orders)
      .where(inArray(orders.customerId, customerIds))
      .groupBy(orders.customerId);

    const aggMap = new Map(aggRows.map((a) => [a.customerId, a]));

    const items: CustomerListItem[] = customerRows.map((c) => {
      const agg = aggMap.get(c.id);
      return {
        ...c,
        isRegistered: Boolean(c.userId),
        ordersCount: agg?.ordersCount ?? 0,
        totalSpend: agg?.totalSpend ?? 0,
        lastOrderDate: agg?.lastOrderDate ?? null,
      };
    });

    return buildPaginatedResult(items, total, filter.page, filter.limit);
  }

  /**
   * Retrieves single deep customer bundle with addresses and recent orders.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<CustomerDetail | null> {
    const [customerRow] = await executor
      .select({
        id: customers.id,
        userId: customers.userId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        notes: customers.notes,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        ordersCount: sql<number>`cast(count(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.id} else null end) as integer)`,
        totalSpend: sql<number>`cast(coalesce(sum(case when ${orders.status} in ('confirmed', 'processing', 'shipped', 'delivered') then ${orders.total} else 0 end), 0) as float)`,
      })
      .from(customers)
      .leftJoin(orders, eq(customers.id, orders.customerId))
      .where(eq(customers.id, id))
      .groupBy(customers.id)
      .limit(1);

    if (!customerRow) return null;

    const customerAddresses = await executor
      .select()
      .from(addresses)
      .where(eq(addresses.customerId, id))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

    const recentOrders = await executor
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        total: orders.total,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.placedAt))
      .limit(10);

    const notesTimeline = await this.listNotes(id, executor);

    return {
      ...customerRow,
      isRegistered: Boolean(customerRow.userId),
      addresses: customerAddresses,
      recentOrders,
      notesTimeline,
    };
  }

  /**
   * Retrieves all active notes for a customer ordered by pinned status and newest to oldest.
   */
  async listNotes(
    customerId: string,
    executor: DatabaseExecutor = db
  ): Promise<CustomerDetailNote[]> {
    const rows = await executor
      .select({
        id: customerNotes.id,
        customerId: customerNotes.customerId,
        body: customerNotes.body,
        createdBy: customerNotes.createdBy,
        isPinned: customerNotes.isPinned,
        createdAt: customerNotes.createdAt,
        authorName: baUser.name,
      })
      .from(customerNotes)
      .leftJoin(baUser, eq(customerNotes.createdBy, baUser.id))
      .where(
        and(
          eq(customerNotes.customerId, customerId),
          isNull(customerNotes.deletedAt)
        )
      )
      .orderBy(desc(customerNotes.isPinned), desc(customerNotes.createdAt));

    return rows;
  }

  /**
   * Appends an audit-tracked administrative staff note to a customer.
   */
  async addNote(
    customerId: string,
    body: string,
    createdBy: string | null = null,
    isPinned: boolean = false,
    executor: DatabaseExecutor = db
  ): Promise<CustomerNote> {
    const [created] = await executor
      .insert(customerNotes)
      .values({
        customerId,
        body: body.trim(),
        createdBy,
        isPinned,
      })
      .returning();

    return created;
  }

  /**
   * Soft-deletes an administrative note by ID, preserving the audit trail (ECOM-004).
   */
  async deleteNote(
    id: string,
    deletedBy: string | null = null,
    executor: DatabaseExecutor = db
  ): Promise<boolean> {
    const [updated] = await executor
      .update(customerNotes)
      .set({
        deletedAt: new Date(),
        deletedBy,
      })
      .where(and(eq(customerNotes.id, id), isNull(customerNotes.deletedAt)))
      .returning({ id: customerNotes.id });

    return Boolean(updated);
  }

  /**
   * ECOM-010: Retrieves single unified activity timeline across orders, status history, payments, and notes.
   */
  async getActivityFeed(
    customerId: string,
    limit: number = 50,
    before?: Date,
    executor: DatabaseExecutor = db
  ): Promise<ActivityEvent[]> {
    const beforeCondition = before ? sql`AND occurred_at < ${before.toISOString()}::timestamptz` : sql``;

    const query = sql`
      WITH activity AS (
        -- 1. Orders Placed
        SELECT 
          o.placed_at AS occurred_at,
          'order.placed'::text AS type,
          'Order Placed (' || o.order_number || ')' AS title,
          'Total: PKR ' || o.total::text AS detail,
          '/orders/' || o.id::text AS link
        FROM orders o
        WHERE o.customer_id = ${customerId}::uuid

        UNION ALL

        -- 2. Order Status Transitions
        SELECT 
          h.created_at AS occurred_at,
          'order.status'::text AS type,
          'Order ' || o.order_number || ' -> ' || h.to_status AS title,
          h.note AS detail,
          '/orders/' || o.id::text AS link
        FROM order_status_history h
        JOIN orders o ON h.order_id = o.id
        WHERE o.customer_id = ${customerId}::uuid

        UNION ALL

        -- 3. Payments
        SELECT 
          p.created_at AS occurred_at,
          ('payment.' || p.status)::text AS type,
          'Payment ' || upper(p.status) || ' (' || o.order_number || ')' AS title,
          'PKR ' || p.amount::text || ' via ' || pm.name AS detail,
          '/orders/' || o.id::text AS link
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        JOIN payment_methods pm ON p.payment_method_id = pm.id
        WHERE o.customer_id = ${customerId}::uuid

        UNION ALL

        -- 4. Customer Notes
        SELECT 
          cn.created_at AS occurred_at,
          'note.added'::text AS type,
          'Internal Note Added' AS title,
          cn.body AS detail,
          '/customers/' || cn.customer_id::text AS link
        FROM customer_notes cn
        WHERE cn.customer_id = ${customerId}::uuid
          AND cn.deleted_at IS NULL
      )
      SELECT occurred_at, type, title, detail, link
      FROM activity
      WHERE 1=1 ${beforeCondition}
      ORDER BY occurred_at DESC
      LIMIT ${limit};
    `;

    const result = await executor.execute(query);
    const rows = (result as any).rows || result || [];
    return rows.map((row: any) => ({
      occurredAt: new Date(row.occurred_at),
      type: row.type,
      title: row.title,
      detail: row.detail,
      link: row.link,
    }));
  }

  /**
   * Find customer by exact normalized email.
   */
  async findByEmail(
    email: string,
    executor: DatabaseExecutor = db
  ): Promise<Customer | null> {
    const [row] = await executor
      .select()
      .from(customers)
      .where(eq(customers.email, email.trim().toLowerCase()))
      .limit(1);
    return row || null;
  }

  /**
   * Concurrency-safe atomic customer upsert by normalized email (DB-001).
   * Uses PostgreSQL ON CONFLICT (lower(trim(email))) in a single statement.
   * If a customer already exists with this email, their record is reused
   * and names/phone are updated if previously null.
   */
  async upsertCustomer(
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
    const normalizedEmail = data.email.trim().toLowerCase();

    const rows = await executor.execute(sql`
      INSERT INTO customers (email, user_id, first_name, last_name, phone, notes)
      VALUES (${normalizedEmail}, ${data.userId || null}, ${data.firstName || null}, ${data.lastName || null}, ${data.phone || null}, ${data.notes || null})
      ON CONFLICT (lower(trim(email))) DO UPDATE
        SET user_id    = COALESCE(customers.user_id, EXCLUDED.user_id),
            first_name = COALESCE(customers.first_name, EXCLUDED.first_name),
            last_name  = COALESCE(customers.last_name,  EXCLUDED.last_name),
            phone      = COALESCE(customers.phone,      EXCLUDED.phone),
            updated_at = now()
      RETURNING *;
    `);

    const r = (rows as any[])[0];
    return {
      id: r.id,
      userId: r.user_id ?? null,
      email: r.email,
      firstName: r.first_name ?? null,
      lastName: r.last_name ?? null,
      phone: r.phone ?? null,
      notes: r.notes ?? null,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    };
  }

  /**
   * Updates customer profile fields.
   */
  async update(
    id: string,
    data: UpdateCustomerInput,
    executor: DatabaseExecutor = db
  ): Promise<Customer | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [updated] = await executor
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Address Book Management
   */
  async addAddress(
    data: NewAddress,
    executor: DatabaseExecutor = db
  ): Promise<Address> {
    if (data.isDefault) {
      await this.clearDefaultAddresses(data.customerId, executor);
    }
    const [newAddr] = await executor.insert(addresses).values(data).returning();
    return newAddr;
  }

  async updateAddress(
    id: string,
    customerId: string,
    data: Partial<NewAddress>,
    executor: DatabaseExecutor = db
  ): Promise<Address | null> {
    if (data.isDefault) {
      await this.clearDefaultAddresses(customerId, executor);
    }
    const [updated] = await executor
      .update(addresses)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)))
      .returning();
    return updated || null;
  }

  async deleteAddress(
    id: string,
    customerId: string,
    executor: DatabaseExecutor = db
  ): Promise<boolean> {
    const result = await executor
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)))
      .returning();
    return result.length > 0;
  }

  async clearDefaultAddresses(
    customerId: string,
    executor: DatabaseExecutor = db
  ): Promise<void> {
    await executor
      .update(addresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(addresses.customerId, customerId));
  }
}

export const customerRepository = new CustomerRepository();
