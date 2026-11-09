import crypto from "node:crypto";
import { and, eq, sql, desc, ilike } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../../db/index.ts";
import { baUser, baAccount, baSession } from "../../db/schema/auth.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { ValidationError, NotFoundError, ConflictError } from "../errors.ts";
import { recordAuditLog } from "../audit.ts";
import type {
  InviteStaffInput,
  UpdateStaffRoleInput,
  BanStaffInput,
  UnbanStaffInput,
  StaffFilterInput,
} from "../validation/staff.ts";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "staff";
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  activeSessionsCount: number;
  lastActiveSession: Date | null;
}

export class StaffService {
  /**
   * Lists all administrative staff accounts with session activity.
   * Strictly requires super_admin role.
   */
  async listStaff(filter: StaffFilterInput = {}, admin: AdminContext): Promise<StaffMember[]> {
    assertRole(admin, ["super_admin"]);

    const query = sql`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        COALESCE(u.banned, false) AS banned,
        u.ban_reason,
        u.created_at,
        u.updated_at,
        COUNT(s.id)::int AS active_sessions_count,
        MAX(s.created_at) AS last_active_session
      FROM ba_user u
      LEFT JOIN ba_session s ON u.id = s.user_id AND s.expires_at > now()
      WHERE u.role IN ('super_admin', 'admin', 'staff')
      ${filter.q ? sql`AND (u.name ILIKE ${`%${filter.q}%`} OR u.email ILIKE ${`%${filter.q}%`})` : sql``}
      ${filter.role ? sql`AND u.role = ${filter.role}` : sql``}
      ${filter.banned !== undefined ? sql`AND COALESCE(u.banned, false) = ${filter.banned}` : sql``}
      GROUP BY u.id, u.name, u.email, u.role, u.banned, u.ban_reason, u.created_at, u.updated_at
      ORDER BY 
        CASE u.role 
          WHEN 'super_admin' THEN 1 
          WHEN 'admin' THEN 2 
          ELSE 3 
        END,
        u.created_at ASC;
    `;

    const result = await db.execute(query);
    const rows = (result as any).rows || result || [];

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      banned: Boolean(r.banned),
      banReason: r.ban_reason,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      activeSessionsCount: Number(r.active_sessions_count || 0),
      lastActiveSession: r.last_active_session ? new Date(r.last_active_session) : null,
    }));
  }

  /**
   * Invites and provisions a new staff member account.
   * Strictly requires super_admin role.
   */
  async inviteStaff(
    input: InviteStaffInput,
    admin: AdminContext
  ): Promise<{ user: StaffMember; temporaryPassword?: string }> {
    assertRole(admin, ["super_admin"]);

    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if user already exists
    const [existing] = await db
      .select({ id: baUser.id })
      .from(baUser)
      .where(eq(sql`lower(${baUser.email})`, normalizedEmail))
      .limit(1);

    if (existing) {
      throw new ConflictError(`An account with email '${normalizedEmail}' already exists.`);
    }

    const tempPassword = input.password || `ScrubX-${crypto.randomBytes(6).toString("hex")}!`;
    const hashedPassword = await hashPassword(tempPassword);
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      // 1. Create User
      await tx.insert(baUser).values({
        id: userId,
        name: input.name.trim(),
        email: normalizedEmail,
        emailVerified: true,
        role: input.role,
        banned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Create Credential Account
      await tx.insert(baAccount).values({
        id: accountId,
        accountId: userId,
        providerId: "credential",
        userId: userId,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Write Audit Log
      await recordAuditLog(
        {
          admin,
          action: "staff.created",
          entityType: "ba_user",
          entityId: userId,
          after: {
            name: input.name.trim(),
            email: normalizedEmail,
            role: input.role,
          },
        },
        tx
      );
    });

    const [createdUser] = await this.listStaff({ q: normalizedEmail }, admin);

    return {
      user: createdUser,
      temporaryPassword: input.password ? undefined : tempPassword,
    };
  }

  /**
   * Updates an administrative staff role.
   * Strictly requires super_admin role.
   */
  async updateStaffRole(input: UpdateStaffRoleInput, admin: AdminContext): Promise<StaffMember> {
    assertRole(admin, ["super_admin"]);

    // Safety rail 1: Super admin cannot demote themselves
    if (input.userId === admin.id && input.role !== "super_admin") {
      throw new ValidationError("You cannot demote your own Super Administrator account.");
    }

    const [targetUser] = await db
      .select()
      .from(baUser)
      .where(eq(baUser.id, input.userId))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundError("Staff member", input.userId);
    }

    // Safety rail 2: Cannot demote the last remaining active super_admin
    if (targetUser.role === "super_admin" && input.role !== "super_admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(baUser)
        .where(
          and(
            eq(baUser.role, "super_admin"),
            eq(sql`COALESCE(${baUser.banned}, false)`, false)
          )
        );

      if (count <= 1) {
        throw new ValidationError(
          "Cannot demote the last remaining active Super Administrator account."
        );
      }
    }

    const oldRole = targetUser.role;

    await db.transaction(async (tx) => {
      await tx
        .update(baUser)
        .set({
          role: input.role,
          updatedAt: new Date(),
        })
        .where(eq(baUser.id, input.userId));

      await recordAuditLog(
        {
          admin,
          action: "staff.role_updated",
          entityType: "ba_user",
          entityId: input.userId,
          before: { role: oldRole },
          after: { role: input.role },
        },
        tx
      );
    });

    const [updated] = await this.listStaff({ q: targetUser.email }, admin);
    return updated;
  }

  /**
   * Suspends / bans a staff account and immediately terminates active sessions.
   * Strictly requires super_admin role.
   */
  async banStaff(input: BanStaffInput, admin: AdminContext): Promise<StaffMember> {
    assertRole(admin, ["super_admin"]);

    // Safety rail 1: Super admin cannot ban themselves
    if (input.userId === admin.id) {
      throw new ValidationError("You cannot suspend your own account.");
    }

    const [targetUser] = await db
      .select()
      .from(baUser)
      .where(eq(baUser.id, input.userId))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundError("Staff member", input.userId);
    }

    // Safety rail 2: Cannot ban last super_admin
    if (targetUser.role === "super_admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(baUser)
        .where(
          and(
            eq(baUser.role, "super_admin"),
            eq(sql`COALESCE(${baUser.banned}, false)`, false)
          )
        );

      if (count <= 1) {
        throw new ValidationError("Cannot ban the last remaining active Super Administrator account.");
      }
    }

    await db.transaction(async (tx) => {
      // 1. Update User to banned
      await tx
        .update(baUser)
        .set({
          banned: true,
          banReason: input.reason.trim(),
          updatedAt: new Date(),
        })
        .where(eq(baUser.id, input.userId));

      // 2. Terminate active sessions immediately (Safety rail 5)
      await tx.delete(baSession).where(eq(baSession.userId, input.userId));

      // 3. Write Audit Log
      await recordAuditLog(
        {
          admin,
          action: "staff.banned",
          entityType: "ba_user",
          entityId: input.userId,
          after: {
            banned: true,
            banReason: input.reason.trim(),
          },
        },
        tx
      );
    });

    const [updated] = await this.listStaff({ q: targetUser.email }, admin);
    return updated;
  }

  /**
   * Unbans / reactivates a suspended staff account.
   * Strictly requires super_admin role.
   */
  async unbanStaff(input: UnbanStaffInput, admin: AdminContext): Promise<StaffMember> {
    assertRole(admin, ["super_admin"]);

    const [targetUser] = await db
      .select()
      .from(baUser)
      .where(eq(baUser.id, input.userId))
      .limit(1);

    if (!targetUser) {
      throw new NotFoundError("Staff member", input.userId);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(baUser)
        .set({
          banned: false,
          banReason: null,
          updatedAt: new Date(),
        })
        .where(eq(baUser.id, input.userId));

      await recordAuditLog(
        {
          admin,
          action: "staff.unbanned",
          entityType: "ba_user",
          entityId: input.userId,
          after: {
            banned: false,
          },
        },
        tx
      );
    });

    const [updated] = await this.listStaff({ q: targetUser.email }, admin);
    return updated;
  }
}

export const staffService = new StaffService();
