import type { Metadata } from "next";
import StaffView from "@/views/Staff";
import { staffService } from "@/server/services/staff.service";
import { requireSuperAdminContext } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff & Team Management",
  description: "Manage internal staff roles, provisioning, and account security.",
};

export default async function StaffPage() {
  const admin = await requireSuperAdminContext();
  const staff = await staffService.listStaff({}, admin);

  return <StaffView initialStaff={staff} currentUserId={admin.id} />;
}
