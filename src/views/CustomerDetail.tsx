'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  ShoppingBag,
  Wallet,
  Pin,
  Trash2,
  Search,
  Clock,
  CheckCircle2,
  CreditCard,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { PageHeader } from "../components/shared/page-header";
import { Avatar } from "../components/shared/thumb";
import { OrderStatusBadge } from "../components/shared/status-badges";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { useCan } from "../components/providers/role-provider";
import { formatDate, formatDateTime, formatPKR, formatRelativeTime } from "../lib/format";
import type { Customer, Order } from "../lib/types";
import {
  addCustomerNoteAction,
  updateCustomerAction,
  deleteCustomerNoteAction,
  getCustomerActivityFeedAction,
} from "../actions/customers";

interface CustomerDetailProps {
  id?: string;
  initialCustomer?: Customer;
  initialOrders?: Order[];
  initialActivityFeed?: Array<{
    occurredAt: string;
    type: string;
    title: string;
    detail: string | null;
    link: string;
  }>;
}

export default function CustomerDetailPage({
  id: propId,
  initialCustomer,
  initialOrders = [],
  initialActivityFeed = [],
}: CustomerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWriteCustomer = useCan("customer:write");
  const canDeleteNote = useCan("settings:write"); // super_admin privilege
  const [note, setNote] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optimisticNotes, setOptimisticNotes] = useState(initialCustomer?.notes || []);
  const [deleteNoteModalOpen, setDeleteNoteModalOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; text: string } | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  // Activity Feed State (ECOM-010)
  const [activityFeed, setActivityFeed] = useState(initialActivityFeed);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [hasMoreActivity, setHasMoreActivity] = useState(initialActivityFeed.length >= 50);

  const customer = initialCustomer;
  const orders = initialOrders;

  const filteredNotes = useMemo(() => {
    let list = [...optimisticNotes];
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });
    if (noteSearch.trim()) {
      const q = noteSearch.toLowerCase();
      list = list.filter((n) => n.text.toLowerCase().includes(q) || n.authorName?.toLowerCase().includes(q));
    }
    return list;
  }, [optimisticNotes, noteSearch]);

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer record may have been removed or does not exist."
        action={
          <Button asChild>
            <Link href="/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  const spend = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const averageOrder = orders.length ? spend / orders.length : 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleAddNote();
    }
  };

  const handleAddNote = async () => {
    if (!note.trim() || isSubmitting) return;
    const body = note.trim();
    const pinned = isPinned;
    const tempId = `temp-${Date.now()}`;
    const optimisticItem = {
      id: tempId,
      text: body,
      at: new Date().toISOString(),
      authorName: "You (just now)",
      isPinned: pinned,
    };

    // Optimistic append
    setOptimisticNotes((prev) => [optimisticItem, ...prev]);
    setNote("");
    setIsPinned(false);
    setIsSubmitting(true);

    try {
      const res = await addCustomerNoteAction({
        customerId: customer.id,
        body,
        isPinned: pinned,
      });

      if (res.success && res.data) {
        toast({ title: "Note saved successfully" });
        setOptimisticNotes((prev) =>
          prev.map((n) => (n.id === tempId ? { ...n, id: res.data.id } : n))
        );
        router.refresh();
      } else {
        toast({
          title: "Failed to save note",
          description: res.error || "An error occurred.",
          variant: "error",
        });
        setOptimisticNotes((prev) => prev.filter((n) => n.id !== tempId));
      }
    } catch (err: any) {
      toast({
        title: "Error saving note",
        description: err.message,
        variant: "error",
      });
      setOptimisticNotes((prev) => prev.filter((n) => n.id !== tempId));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!noteToDelete || isDeletingNote) return;
    setIsDeletingNote(true);
    try {
      const res = await deleteCustomerNoteAction({
        id: noteToDelete.id,
        customerId: customer.id,
      });

      if (res.success) {
        toast({ title: "Note removed" });
        setOptimisticNotes((prev) => prev.filter((n) => n.id !== noteToDelete.id));
        setDeleteNoteModalOpen(false);
        setNoteToDelete(null);
        router.refresh();
      } else {
        toast({
          title: "Failed to remove note",
          description: res.error || "You must be a Super Administrator to delete notes.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsDeletingNote(false);
    }
  };

  const handleLoadMoreActivity = async () => {
    if (activityFeed.length === 0 || loadingMoreActivity) return;
    const lastEvent = activityFeed[activityFeed.length - 1];
    setLoadingMoreActivity(true);
    try {
      const res = await getCustomerActivityFeedAction({
        customerId: customer.id,
        limit: 50,
        before: lastEvent.occurredAt,
      });

      if (res.success && res.data) {
        const newEvents = res.data.map((ev) => ({
          ...ev,
          occurredAt: ev.occurredAt instanceof Date ? ev.occurredAt.toISOString() : String(ev.occurredAt),
        }));
        if (newEvents.length < 50) {
          setHasMoreActivity(false);
        }
        setActivityFeed((prev) => [...prev, ...newEvents]);
      }
    } catch {
      toast({ title: "Failed to load more activity", variant: "error" });
    } finally {
      setLoadingMoreActivity(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/customers" className="inline-flex items-center gap-1 hover:text-brand-800">
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </Link>
        }
        title={customer.name}
        description={`${customer.type === "registered" ? "Registered customer" : "Guest customer"} · ${customer.city} · joined ${formatDate(customer.registeredAt)}`}
        actions={
          <Badge variant={customer.type === "registered" ? "brand" : "neutral"}>
            {customer.type === "registered" ? "Registered" : "Guest"}
          </Badge>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Total orders", value: String(orders.length), icon: ShoppingBag },
              { label: "Total spending", value: formatPKR(spend), icon: Wallet },
              { label: "Average order", value: formatPKR(averageOrder), icon: ShoppingBag },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-start justify-between p-4">
                  <div>
                    <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                    <p className="mt-1.5 text-[20px] font-semibold text-ink tabular">{stat.value}</p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
                    <stat.icon className="h-4.5 w-4.5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Order history</h2>
              <Badge variant="neutral">{orders.length} orders</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <EmptyState
                  className="m-4"
                  title="No orders yet"
                  description="When this customer places an order it will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-[13px] font-semibold text-brand-700 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-ink-muted">{formatDate(order.date)}</TableCell>
                        <TableCell className="tabular">
                          {order.items.reduce((sum, i) => sum + i.quantity, 0)} units
                        </TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {formatPKR(order.total)}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Staff notes Card (ECOM-004) */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-line pb-4">
              <div className="space-y-0.5">
                <h2 className="text-[15px] font-semibold text-ink">Staff notes</h2>
                <p className="text-[12.5px] text-ink-muted">
                  Audited internal notes regarding sizing, hospital affiliation, or preferences.
                </p>
              </div>
              <div className="w-48">
                <Input
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search notes…"
                  className="h-8 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {filteredNotes.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  {noteSearch ? "No notes matching your search." : "No notes on this customer yet."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {filteredNotes.map((item) => (
                    <div
                      key={item.id}
                      className={`group relative rounded-lg border p-3.5 shadow-2xs transition-colors ${
                        item.isPinned
                          ? "border-purple-200 bg-purple-50/20"
                          : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          {item.isPinned && (
                            <Badge variant="purple" className="mb-1 gap-1 text-[10.5px] py-0 px-1.5 h-4">
                              <Pin className="h-2.5 w-2.5" />
                              Pinned Note
                            </Badge>
                          )}
                          <p className="text-[13px] text-ink whitespace-pre-wrap">{item.text}</p>
                          <p className="text-[11.5px] text-ink-muted">
                            Recorded {formatRelativeTime(item.at)} ({formatDateTime(item.at)})
                            {item.authorName ? ` by ${item.authorName}` : ""}
                          </p>
                        </div>
                        {canDeleteNote && (
                          <button
                            type="button"
                            onClick={() => {
                              setNoteToDelete({ id: item.id, text: item.text });
                              setDeleteNoteModalOpen(true);
                            }}
                            className="text-ink-muted hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 p-1"
                            title="Delete note (Super Admin only)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canWriteCustomer && (
                <div className="space-y-2 border-t border-line/70 pt-3">
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Record customer preferences, sizing or clinic affiliation (Ctrl+Enter to save)…"
                    className="w-full text-xs"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink-soft select-none">
                      <input
                        type="checkbox"
                        checked={isPinned}
                        onChange={(e) => setIsPinned(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-line text-purple-600 focus:ring-purple-500"
                      />
                      <span>Pin note to top</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-muted hidden sm:inline">
                        Press <kbd className="rounded border border-line bg-surface-muted px-1 py-0.5 text-[10px] font-mono">Ctrl+Enter</kbd> to submit
                      </span>
                      <Button
                        size="sm"
                        disabled={!note.trim() || isSubmitting}
                        onClick={handleAddNote}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" />
                        {isSubmitting ? "Saving..." : "Add note"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unified Activity & Communication Timeline (ECOM-010) */}
          <Card className="border-line shadow-2xs">
            <CardHeader className="border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-700" />
                <h2 className="text-[15px] font-semibold text-ink">Activity & Communication Timeline</h2>
              </div>
              <p className="text-[12.5px] text-ink-muted">
                Unified chronological timeline of orders placed, status transitions, payment submissions, and notes.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {activityFeed.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No activity records found for this customer.</p>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
                  {activityFeed.map((ev, idx) => (
                    <div key={`${ev.occurredAt}-${idx}`} className="relative group">
                      <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-muted">
                        {ev.type.startsWith("order.") ? (
                          <Package className="h-2.5 w-2.5 text-brand-700" />
                        ) : ev.type.startsWith("payment.") ? (
                          <CreditCard className="h-2.5 w-2.5 text-indigo-700" />
                        ) : (
                          <MessageSquarePlus className="h-2.5 w-2.5 text-purple-700" />
                        )}
                      </div>
                      <div className="rounded-lg border border-line/60 bg-surface p-3 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          {ev.link ? (
                            <Link
                              href={ev.link}
                              className="text-xs font-semibold text-brand-700 hover:underline"
                            >
                              {ev.title}
                            </Link>
                          ) : (
                            <span className="text-xs font-semibold text-ink">{ev.title}</span>
                          )}
                          <span className="text-[11px] text-ink-muted tabular">
                            {formatRelativeTime(ev.occurredAt)}
                          </span>
                        </div>
                        {ev.detail && (
                          <p className="mt-1 text-xs text-ink-soft">{ev.detail}</p>
                        )}
                        <p className="mt-1 text-[10.5px] text-ink-muted">
                          {formatDateTime(ev.occurredAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hasMoreActivity && (
                <div className="pt-2 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMoreActivity}
                    disabled={loadingMoreActivity}
                    className="h-8 text-xs"
                  >
                    {loadingMoreActivity ? "Loading..." : "Load older activity"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={customer.name} size="lg" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{customer.name}</p>
                  <p className="text-[12px] text-ink-muted">{customer.city}, Pakistan</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-2 break-all text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <Mail className="h-3.5 w-3.5 text-ink-muted" />
                  {customer.email}
                </a>
                <a
                  href={`tel:${customer.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <Phone className="h-3.5 w-3.5 text-ink-muted" />
                  {customer.phone}
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Addresses</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.addresses.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No saved addresses.</p>
              ) : (
                customer.addresses.map((address) => (
                  <div
                    key={`${address.label}-${address.line1}`}
                    className="rounded-lg border border-line bg-surface-muted/50 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                        <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                        {address.label}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                      {address.recipient}
                      <br />
                      {address.line1}
                      {address.line2 && (
                        <>
                          <br />
                          {address.line2}
                        </>
                      )}
                      <br />
                      {address.city}, {address.province} {address.postcode}
                      <br />
                      {address.country}
                    </p>
                    <p className="mt-1.5 text-[11.5px] text-ink-muted">{address.phone}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Note Confirmation Dialog (ECOM-004) */}
      <Dialog open={deleteNoteModalOpen} onOpenChange={setDeleteNoteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Staff Note
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this staff note? This action soft-deletes the note while preserving the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {noteToDelete && (
              <div className="rounded border border-line bg-surface-muted/50 p-3 text-xs text-ink italic">
                &ldquo;{noteToDelete.text}&rdquo;
              </div>
            )}
            <p className="text-xs text-ink-muted">
              Note: Only Super Administrators can delete internal staff notes.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isDeletingNote}
              onClick={handleDeleteNote}
            >
              {isDeletingNote ? "Deleting..." : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
