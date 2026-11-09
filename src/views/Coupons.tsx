'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PageHeader } from "../components/shared/page-header";
import { EmptyState } from "../components/shared/empty-state";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { SearchInput } from "../components/shared/search-input";
import { Pagination } from "../components/shared/pagination";
import { useToast } from "../components/ui/toast";
import { formatDate, formatPKR } from "../lib/format";
import { cn, uid } from "../lib/utils";
import type { Coupon } from "../lib/types";
import {
  createCouponAction,
  updateCouponAction,
  toggleCouponStatusAction,
  deleteCouponAction,
} from "../actions/coupons";

interface CouponsProps {
  initialCoupons?: Coupon[];
  initialPagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export default function CouponsPage({
  initialCoupons = [],
  initialPagination,
}: CouponsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);

  useEffect(() => {
    setCoupons(initialCoupons);
  }, [initialCoupons]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Coupon["status"]>("all");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(initialPagination?.currentPage ?? 1);
  const [pageSize, setPageSize] = useState(initialPagination?.limit ?? 20);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return coupons.filter((coupon) => {
      const matchesQuery =
        !q || coupon.code.toLowerCase().includes(q) || coupon.description.toLowerCase().includes(q);
      const matchesStatus = status === "all" || coupon.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [coupons, query, status]);

  const openCreate = () => {
    setEditing({
      id: uid("cpn"),
      code: "",
      description: "",
      type: "percentage",
      value: 10,
      minOrderAmount: 2500,
      maxDiscount: 1000,
      usageLimit: 100,
      perCustomerLimit: 1,
      firstOrderOnly: false,
      startsAt: new Date().toISOString().slice(0, 10),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      usedCount: 0,
      status: "active",
    });
    setDialogOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing({
      ...coupon,
      startsAt: coupon.startsAt.slice(0, 10),
      expiresAt: coupon.expiresAt.slice(0, 10),
    });
    setDialogOpen(true);
  };

  const handleSave = async (coupon: Coupon) => {
    setIsSubmitting(true);
    const isExisting = coupons.some((c) => c.id === coupon.id);
    const code = coupon.code.toUpperCase().replace(/\s/g, "");

    try {
      if (isExisting) {
        const res = await updateCouponAction({
          id: coupon.id,
          code,
          description: coupon.description || null,
          discountType: coupon.type === "percentage" ? "percentage" : "fixed_amount",
          discountValue: Number(coupon.value),
          minimumOrderAmount: Number(coupon.minOrderAmount),
          maximumDiscountAmount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
          usageLimit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
          usageLimitPerCustomer: coupon.perCustomerLimit ? Number(coupon.perCustomerLimit) : null,
          firstOrderOnly: Boolean(coupon.firstOrderOnly),
          startsAt: new Date(coupon.startsAt),
          expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
          isActive: coupon.status === "active",
        });

        if (res.success) {
          toast({
            title: "Coupon updated",
            description: code,
          });
          setDialogOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Failed to update coupon",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      } else {
        const res = await createCouponAction({
          code,
          description: coupon.description || null,
          discountType: coupon.type === "percentage" ? "percentage" : "fixed_amount",
          discountValue: Number(coupon.value),
          minimumOrderAmount: Number(coupon.minOrderAmount),
          maximumDiscountAmount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
          usageLimit: coupon.usageLimit ? Number(coupon.usageLimit) : null,
          usageLimitPerCustomer: coupon.perCustomerLimit ? Number(coupon.perCustomerLimit) : null,
          firstOrderOnly: Boolean(coupon.firstOrderOnly),
          startsAt: new Date(coupon.startsAt),
          expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
          isActive: coupon.status === "active",
        });

        if (res.success) {
          toast({
            title: "Coupon created",
            description: code,
          });
          setDialogOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Failed to create coupon",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Error saving coupon",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (coupon: Coupon) => {
    try {
      const nextActive = coupon.status !== "active";
      const res = await toggleCouponStatusAction({
        id: coupon.id,
        isActive: nextActive,
      });

      if (res.success) {
        toast({
          title: nextActive ? "Coupon activated" : "Coupon disabled",
          description: coupon.code,
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to toggle status",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error toggling status",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await deleteCouponAction({ id: deleteTarget.id });
      if (res.success) {
        toast({ title: "Coupon deleted", variant: "error" });
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast({
          title: "Failed to delete coupon",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error deleting coupon",
        description: err.message,
        variant: "error",
      });
    }
  };

  const activeCount = coupons.filter((c) => c.status === "active").length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + c.usedCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Marketing"
        title="Coupons"
        description="Create percentage or fixed discounts with usage limits, expiry dates and first-order rules."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New coupon
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active coupons", value: String(activeCount) },
          { label: "Total vouchers", value: String(coupons.length) },
          { label: "Total redemptions", value: String(totalRedemptions) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
              <p className="mt-1.5 text-[22px] font-semibold text-ink tabular">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by coupon code or description…"
              className="w-full sm:w-80"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as "all" | Coupon["status"])}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<BadgePercent className="h-5 w-5" />}
              title="No coupons found"
              description="Create a promotional code to attract new healthcare professionals."
              action={<Button onClick={openCreate}>Create coupon</Button>}
            />
          ) : (
            <>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Min. Order</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <div>
                        <span className="font-mono text-[13px] font-semibold text-brand-700">
                          {coupon.code}
                        </span>
                        <p className="text-[11.5px] text-ink-muted">{coupon.description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-ink">
                      {coupon.type === "percentage" ? `${coupon.value}% off` : formatPKR(coupon.value)}
                      {coupon.maxDiscount && (
                        <span className="block text-[11.5px] text-ink-muted">
                          Up to {formatPKR(coupon.maxDiscount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular">
                      <span className="font-medium text-ink">{coupon.usedCount}</span>
                      <span className="text-ink-muted">
                        {" "}
                        / {coupon.usageLimit ? coupon.usageLimit : "∞"}
                      </span>
                      {coupon.perCustomerLimit && (
                        <span className="block text-[11.5px] text-ink-muted">
                          {coupon.perCustomerLimit}/customer
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular">{formatPKR(coupon.minOrderAmount)}</TableCell>
                    <TableCell className="text-ink-muted">
                      {formatDate(coupon.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          coupon.status === "active"
                            ? "success"
                            : coupon.status === "scheduled"
                            ? "info"
                            : coupon.status === "expired"
                            ? "neutral"
                            : "warning"
                        }
                      >
                        {coupon.status === "active"
                          ? "Active"
                          : coupon.status === "scheduled"
                          ? "Scheduled"
                          : coupon.status === "expired"
                          ? "Expired"
                          : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Coupon actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEdit(coupon)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit coupon
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(coupon)}>
                            {coupon.status === "active" ? "Disable coupon" : "Activate coupon"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => setDeleteTarget(coupon)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={initialPagination ? initialPagination.currentPage : page}
              pageSize={initialPagination ? initialPagination.limit : pageSize}
              total={initialPagination ? initialPagination.totalItems : filtered.length}
              onPageChange={(newPage) => {
                setPage(newPage);
                if (initialPagination) {
                  router.push(`?page=${newPage}&limit=${pageSize}`);
                }
              }}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
                if (initialPagination) {
                  router.push(`?page=1&limit=${size}`);
                }
              }}
            />
          </>
          )}
        </CardContent>
      </Card>

      <CouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coupon={editing}
        onSave={handleSave}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete coupon?"
        description={
          deleteTarget ? `“${deleteTarget.code}” will stop working immediately.` : undefined
        }
        confirmLabel="Delete coupon"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CouponDialog({
  open,
  onOpenChange,
  coupon,
  onSave,
  isSubmitting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: Coupon | null;
  onSave: (coupon: Coupon) => void;
  isSubmitting?: boolean;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Coupon | null>(coupon);

  useEffect(() => {
    setDraft(coupon);
  }, [coupon]);

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{coupon?.code ? "Edit coupon" : "New coupon"}</DialogTitle>
          <DialogDescription>
            Set the discount, eligibility rules and redemption limits.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cpn-code">Coupon code</Label>
              <Input
                id="cpn-code"
                value={draft.code}
                onChange={(e) =>
                  setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, "") })
                }
                placeholder="WELCOME10"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label>Discount type</Label>
              <Select
                value={draft.type}
                onValueChange={(value) => setDraft({ ...draft, type: value as "percentage" | "fixed" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cpn-value">
                Value {draft.type === "percentage" ? "(%)" : "(Rs.)"}
              </Label>
              <Input
                id="cpn-value"
                type="number"
                min={0}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="cpn-min">Minimum order amount (Rs.)</Label>
              <Input
                id="cpn-min"
                type="number"
                min={0}
                value={draft.minOrderAmount}
                onChange={(e) => setDraft({ ...draft, minOrderAmount: Number(e.target.value) })}
              />
            </div>
            {draft.type === "percentage" && (
              <div>
                <Label htmlFor="cpn-cap">Cap maximum discount (Rs.)</Label>
                <Input
                  id="cpn-cap"
                  type="number"
                  min={0}
                  value={draft.maxDiscount ?? ""}
                  placeholder="Optional cap (e.g. 1000)"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      maxDiscount: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
            )}
            <div>
              <Label htmlFor="cpn-usage">Overall usage limit</Label>
              <Input
                id="cpn-usage"
                type="number"
                min={0}
                value={draft.usageLimit ?? ""}
                placeholder="Unlimited if empty"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    usageLimit: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="cpn-cust">Per-customer limit</Label>
              <Input
                id="cpn-cust"
                type="number"
                min={1}
                value={draft.perCustomerLimit ?? 1}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    perCustomerLimit: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="cpn-start">Starts at</Label>
              <Input
                id="cpn-start"
                type="date"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cpn-exp">Expires at</Label>
              <Input
                id="cpn-exp"
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cpn-desc">Description</Label>
              <Textarea
                id="cpn-desc"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. 10% off for verified junior doctors on their first scrub order."
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">First order only</p>
              <p className="text-[12px] text-ink-muted">
                Restricts this voucher code so only new customer accounts can apply it.
              </p>
            </div>
            <Switch
              checked={draft.firstOrderOnly}
              onCheckedChange={(checked) => setDraft({ ...draft, firstOrderOnly: checked })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Active</p>
              <p className="text-[12px] text-ink-muted">
                Deactivated coupons cannot be applied in customer checkouts.
              </p>
            </div>
            <Switch
              checked={draft.status === "active"}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, status: checked ? "active" : "inactive" })
              }
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!draft.code.trim() || isSubmitting}
            onClick={() => {
              if (!draft.code.trim()) {
                toast({ title: "Coupon code is required", variant: "error" });
                return;
              }
              onSave(draft);
            }}
          >
            {isSubmitting ? "Saving..." : coupon?.code ? "Save changes" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
