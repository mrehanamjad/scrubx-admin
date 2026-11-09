'use client';

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Ban,
  CheckCircle2,
  Copy,
  Check,
  MoreVertical,
  Key,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { PageHeader } from "../components/shared/page-header";
import { Avatar } from "../components/shared/thumb";
import { useToast } from "../components/ui/toast";
import { formatDateTime, formatRelativeTime } from "../lib/format";
import type { StaffMember } from "../server/services/staff.service";
import {
  inviteStaffAction,
  updateStaffRoleAction,
  banStaffAction,
  unbanStaffAction,
} from "../actions/staff";

interface StaffViewProps {
  initialStaff: StaffMember[];
  currentUserId: string;
}

export default function StaffView({ initialStaff, currentUserId }: StaffViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Modals state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"super_admin" | "admin" | "staff">("staff");
  const [invitePassword, setInvitePassword] = useState("");
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Credentials lightbox for newly created staff
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword?: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Role change modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [targetStaffForRole, setTargetStaffForRole] = useState<StaffMember | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<"super_admin" | "admin" | "staff">("staff");
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // Ban modal
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [targetStaffForBan, setTargetStaffForBan] = useState<StaffMember | null>(null);
  const [banReason, setBanReason] = useState("");
  const [isSubmittingBan, setIsSubmittingBan] = useState(false);

  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      if (roleFilter !== "all" && s.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      }
      return true;
    });
  }, [staffList, searchQuery, roleFilter]);

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast({ title: "Name and email are required.", variant: "error" });
      return;
    }

    setIsSubmittingInvite(true);
    try {
      const res = await inviteStaffAction({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        password: invitePassword.trim() || undefined,
      });

      if (res.success && res.data) {
        toast({ title: "Staff member provisioned successfully" });
        setInviteModalOpen(false);
        setCreatedCredentials({
          email: res.data.user.email,
          temporaryPassword: res.data.temporaryPassword || invitePassword.trim(),
        });
        setInviteName("");
        setInviteEmail("");
        setInviteRole("staff");
        setInvitePassword("");
        router.refresh();
      } else {
        toast({ title: "Failed to invite staff", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error provisioning account", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!targetStaffForRole) return;
    setIsSubmittingRole(true);
    try {
      const res = await updateStaffRoleAction({
        userId: targetStaffForRole.id,
        role: selectedNewRole,
      });

      if (res.success && res.data) {
        toast({ title: "Role updated successfully", description: `${res.data.name} is now ${res.data.role}.` });
        setRoleModalOpen(false);
        setTargetStaffForRole(null);
        setStaffList((prev) =>
          prev.map((s) => (s.id === res.data.id ? res.data : s))
        );
        router.refresh();
      } else {
        toast({ title: "Failed to update role", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error updating role", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleBan = async () => {
    if (!targetStaffForBan || !banReason.trim()) return;
    setIsSubmittingBan(true);
    try {
      const res = await banStaffAction({
        userId: targetStaffForBan.id,
        reason: banReason.trim(),
      });

      if (res.success && res.data) {
        toast({
          title: "Account suspended",
          description: `${res.data.name} suspended and all active sessions terminated.`,
        });
        setBanModalOpen(false);
        setTargetStaffForBan(null);
        setBanReason("");
        setStaffList((prev) =>
          prev.map((s) => (s.id === res.data.id ? res.data : s))
        );
        router.refresh();
      } else {
        toast({ title: "Failed to suspend account", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error suspending account", description: err.message, variant: "error" });
    } finally {
      setIsSubmittingBan(false);
    }
  };

  const handleUnban = async (member: StaffMember) => {
    try {
      const res = await unbanStaffAction({ userId: member.id });
      if (res.success && res.data) {
        toast({ title: "Account reactivated", description: `${res.data.name} can now sign in.` });
        setStaffList((prev) =>
          prev.map((s) => (s.id === res.data.id ? res.data : s))
        );
        router.refresh();
      } else {
        toast({ title: "Failed to reactivate account", description: res.error, variant: "error" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "error" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
    toast({ title: "Copied password to clipboard" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Administrative Team"
        description="Manage internal operator access, roles, and session security. Strictly restricted to Super Administrators."
        actions={
          <Button
            onClick={() => setInviteModalOpen(true)}
            className="gap-2 bg-brand-700 hover:bg-brand-800 text-white shadow-xs"
          >
            <UserPlus className="h-4 w-4" />
            Invite Staff Member
          </Button>
        }
      />

      {/* Filter and stats row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9 text-xs"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36 text-xs">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>{filteredStaff.length} team members</span>
        </div>
      </div>

      {/* Staff Table */}
      <Card className="border-line shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Member</TableHead>
              <TableHead>Role & Permissions</TableHead>
              <TableHead>Account Status</TableHead>
              <TableHead>Active Sessions</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.map((member) => {
              const isSelf = member.id === currentUserId;
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} size="md" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-ink">{member.name}</span>
                          {isSelf && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                              You
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11.5px] text-ink-muted">{member.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        member.role === "super_admin"
                          ? "purple"
                          : member.role === "admin"
                          ? "brand"
                          : "outline"
                      }
                      className="font-medium capitalize text-[11.5px]"
                    >
                      {member.role.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.banned ? (
                      <div className="space-y-0.5">
                        <Badge variant="danger" className="text-[11px] gap-1">
                          <Ban className="h-3 w-3" />
                          Suspended
                        </Badge>
                        {member.banReason && (
                          <p className="text-[10.5px] text-rose-600 truncate max-w-[180px]">
                            {member.banReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Badge variant="success" className="text-[11px] gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <span className="font-medium text-ink">
                        {member.activeSessionsCount} active session{member.activeSessionsCount === 1 ? "" : "s"}
                      </span>
                      {member.lastActiveSession && (
                        <p className="text-[11px] text-ink-muted">
                          Last active: {formatRelativeTime(member.lastActiveSession)}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDateTime(member.createdAt.toISOString())}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf}
                        onClick={() => {
                          setTargetStaffForRole(member);
                          setSelectedNewRole(member.role);
                          setRoleModalOpen(true);
                        }}
                        className="h-7 text-xs px-2"
                        title={isSelf ? "You cannot modify your own role" : "Modify staff role"}
                      >
                        Change Role
                      </Button>

                      {member.banned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnban(member)}
                          className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 px-2"
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf}
                          onClick={() => {
                            setTargetStaffForBan(member);
                            setBanReason("Administrative deactivation");
                            setBanModalOpen(true);
                          }}
                          className="h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 px-2"
                          title={isSelf ? "You cannot suspend yourself" : "Suspend account"}
                        >
                          Suspend
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* 1. INVITE STAFF MODAL */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-800 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Provision New Staff Account
            </DialogTitle>
            <DialogDescription>
              Create an administrative user profile. A secure one-time password will be generated for handoff.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="staffNameInput" className="text-xs font-semibold">
                Full Name
              </Label>
              <Input
                id="staffNameInput"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Dr. Bilal Tariq"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staffEmailInput" className="text-xs font-semibold">
                Email Address
              </Label>
              <Input
                id="staffEmailInput"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="e.g. bilal@scrubx.pk"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staffRoleSelect" className="text-xs font-semibold">
                Role & Capability Tier
              </Label>
              <Select
                value={inviteRole}
                onValueChange={(val: any) => setInviteRole(val)}
              >
                <SelectTrigger id="staffRoleSelect" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff — Read/Order processing only</SelectItem>
                  <SelectItem value="admin">Admin — Catalog, Orders, Inventory, Discounts</SelectItem>
                  <SelectItem value="super_admin">Super Admin — Full system access & settings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staffPasswordInput" className="text-xs font-semibold">
                Custom Password (Optional)
              </Label>
              <Input
                id="staffPasswordInput"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="Leave blank to auto-generate secure password"
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-ink-muted">
                If omitted, a random cryptographically secure temporary password will be generated.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-brand-700 hover:bg-brand-800 text-white"
              disabled={isSubmittingInvite}
              onClick={handleInvite}
            >
              {isSubmittingInvite ? "Creating..." : "Provision Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. CREDENTIALS LIGHTBOX (FOR ONE-TIME DISPLAY) */}
      <Dialog open={Boolean(createdCredentials)} onOpenChange={() => setCreatedCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-emerald-700 flex items-center gap-2">
              <Key className="h-5 w-5" />
              Staff Account Ready
            </DialogTitle>
            <DialogDescription>
              Account created for <strong>{createdCredentials?.email}</strong>. Share these temporary credentials securely with the operator.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="rounded-lg border border-line bg-surface-muted/60 p-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-muted">Sign In URL:</span>
                <span className="font-mono font-medium text-ink">https://admin.scrubx.pk/login</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-muted">Email:</span>
                <span className="font-mono font-semibold text-ink">{createdCredentials?.email}</span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-line/60 pt-2">
                <span className="text-ink-muted">Temporary Password:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-brand-800 bg-white px-2 py-0.5 rounded border border-line">
                    {createdCredentials?.temporaryPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdCredentials?.temporaryPassword || "")}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface transition-colors"
                    title="Copy password"
                  >
                    {copiedPassword ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
              Important: This temporary password will only be displayed once. Copy and deliver it securely.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="default" onClick={() => setCreatedCredentials(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. CHANGE ROLE MODAL */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-800 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Change Staff Role
            </DialogTitle>
            <DialogDescription>
              Update authority tier for <strong>{targetStaffForRole?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select New Role</Label>
              <Select
                value={selectedNewRole}
                onValueChange={(val: any) => setSelectedNewRole(val)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff — Read/Order processing only</SelectItem>
                  <SelectItem value="admin">Admin — Full operational catalog & orders</SelectItem>
                  <SelectItem value="super_admin">Super Admin — System configuration & staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={isSubmittingRole || selectedNewRole === targetStaffForRole?.role}
              onClick={handleUpdateRole}
            >
              {isSubmittingRole ? "Updating..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. SUSPEND/BAN MODAL */}
      <Dialog open={banModalOpen} onOpenChange={setBanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <Ban className="h-5 w-5" />
              Suspend Staff Account
            </DialogTitle>
            <DialogDescription>
              Suspending <strong>{targetStaffForBan?.name}</strong> will immediately terminate all active sessions and block sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="banReasonInput" className="text-xs font-semibold">
                Suspension Reason
              </Label>
              <Input
                id="banReasonInput"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="e.g. Employee departure, security precaution…"
                className="text-xs"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isSubmittingBan || !banReason.trim()}
              onClick={handleBan}
            >
              {isSubmittingBan ? "Suspending..." : "Confirm Suspension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
