'use client';

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Eye,
  FileWarning,
  SearchX,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PageHeader } from "../components/shared/page-header";
import { EmptyState } from "../components/shared/empty-state";
import { SearchInput } from "../components/shared/search-input";
import { Avatar } from "../components/shared/thumb";
import { Pagination } from "../components/shared/pagination";
import { useToast } from "../components/ui/toast";
import { useCan } from "../components/providers/role-provider";
import { PAYMENT_METHOD_LABEL } from "../lib/constants";
import { formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { PaymentSubmission } from "../lib/types";
import { approvePaymentAction, rejectPaymentAction } from "../actions/payments";

interface PaymentsProps {
  initialSubmissions?: PaymentSubmission[];
  initialPagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export default function PaymentsPage({
  initialSubmissions = [],
  initialPagination,
}: PaymentsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canVerify = useCan("payment:verify");
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>(initialSubmissions);

  useEffect(() => {
    setSubmissions(initialSubmissions);
  }, [initialSubmissions]);

  const [query, setQuery] = useState("");
  const [proofTarget, setProofTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sortedSubmissions = useMemo(
    () => [...submissions].sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt)),
    [submissions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedSubmissions;
    return sortedSubmissions.filter(
      (s) =>
        s.orderNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.transactionRef.toLowerCase().includes(q),
    );
  }, [sortedSubmissions, query]);

  const pending = filtered.filter((s) => s.status === "submitted");
  const approved = filtered.filter((s) => s.status === "approved");
  const rejected = filtered.filter((s) => s.status === "rejected");

  const stats = [
    {
      label: "Awaiting verification",
      value: String(pending.length),
      hint: `${formatPKR(pending.reduce((s, p) => s + p.amount, 0))} pending`,
      icon: Clock,
      tone: "amber",
    },
    {
      label: "Approved",
      value: String(approved.length),
      hint: `${formatPKR(approved.reduce((s, p) => s + p.amount, 0))} verified`,
      icon: CheckCircle2,
      tone: "brand",
    },
    {
      label: "Rejected",
      value: String(rejected.length),
      hint: "Needs customer re-submission",
      icon: XCircle,
      tone: "rose",
    },
    {
      label: "Verified value",
      value: formatPKR(approved.reduce((s, p) => s + p.amount, 0)),
      hint: "Across all payment methods",
      icon: CircleDollarSign,
      tone: "navy",
    },
  ];

  const proof = submissions.find((s) => s.id === proofTarget);
  const rejectSubmission = submissions.find((s) => s.id === rejectTarget);

  const handleApprove = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await approvePaymentAction({ paymentId: id, action: "approve" });
      if (res.success) {
        toast({
          title: "Payment approved",
          description: "Order marked paid and stock committed.",
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to approve payment",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error approving payment",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await rejectPaymentAction({
        paymentId: rejectTarget,
        action: "reject",
        rejectionReason: rejectReason.trim(),
      });

      if (res.success) {
        toast({
          title: "Payment rejected",
          description: "The payment proof has been rejected.",
          variant: "error",
        });
        setRejectTarget(null);
        setRejectReason("");
        router.refresh();
      } else {
        toast({
          title: "Failed to reject payment",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error rejecting payment",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payment verification"
        description="Check submitted transaction proofs, approve legitimate payments and reject invalid ones."
        actions={
          <Badge variant="neutral">
            <ShieldCheck className="h-3 w-3" />
            Manual review required
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11.5px] text-ink-muted">{stat.hint}</p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600",
                  stat.tone === "brand" && "bg-brand-50 text-brand-600",
                  stat.tone === "rose" && "bg-rose-50 text-rose-600",
                  stat.tone === "navy" && "bg-navy-50 text-navy-600",
                )}
              >
                <stat.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="pending">
            <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="pending">
                  <Clock className="h-3.5 w-3.5" />
                  Awaiting review ({pending.length})
                </TabsTrigger>
                <TabsTrigger value="approved">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved ({approved.length})
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  <XCircle className="h-3.5 w-3.5" />
                  Rejected ({rejected.length})
                </TabsTrigger>
              </TabsList>

              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search by order #, customer or reference…"
                className="w-full sm:w-72"
              />
            </div>

            <TabsContent value="pending" className="p-0">
              <SubmissionList
                items={pending}
                onViewProof={(id) => setProofTarget(id)}
                onApprove={canVerify ? handleApprove : undefined}
                onReject={canVerify ? (id) => setRejectTarget(id) : undefined}
                emptyState={
                  <EmptyState
                    className="m-4"
                    icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                    title="Queue is all clear"
                    description="No payments currently waiting for verification."
                  />
                }
              />
            </TabsContent>

            <TabsContent value="approved" className="p-0">
              <SubmissionList
                items={approved}
                onViewProof={(id) => setProofTarget(id)}
                emptyState={
                  <EmptyState
                    className="m-4"
                    title="No approved payments yet"
                    description="Approved customer proofs will be catalogued here."
                  />
                }
              />
            </TabsContent>

            <TabsContent value="rejected" className="p-0">
              <SubmissionList
                items={rejected}
                onViewProof={(id) => setProofTarget(id)}
                emptyState={
                  <EmptyState
                    className="m-4"
                    title="No rejected payments"
                    description="Submissions flagged as mismatched or invalid will appear here."
                  />
                }
              />
            </TabsContent>
          </Tabs>
          {initialPagination && (
            <Pagination
              page={initialPagination.currentPage}
              pageSize={initialPagination.limit}
              total={initialPagination.totalItems}
              onPageChange={(newPage) => {
                router.push(`?page=${newPage}&limit=${initialPagination.limit}`);
              }}
              onPageSizeChange={(size) => {
                router.push(`?page=1&limit=${size}`);
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Proof Preview Dialog */}
      <Dialog open={Boolean(proof)} onOpenChange={(open) => !open && setProofTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment receipt · {proof?.orderNumber}</DialogTitle>
            <DialogDescription>
              Submitted {proof && formatDateTime(proof.submittedAt)} · Ref: {proof?.transactionRef}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="relative min-h-[220px] max-h-[460px] overflow-hidden rounded-lg border border-line bg-surface-muted flex items-center justify-center">
              {proof?.proofUrl ? (
                <Image
                  src={proof.proofUrl}
                  alt={`Proof for ${proof.orderNumber}`}
                  width={600}
                  height={460}
                  unoptimized
                  className="max-h-[460px] w-auto max-w-full object-contain mx-auto"
                />
              ) : (
                <div className="flex h-48 items-center justify-center text-ink-muted">
                  No image provided
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div>
                <p className="text-ink-muted">Customer</p>
                <p className="font-medium text-ink">{proof?.customerName}</p>
                <p className="text-ink-muted">{proof?.customerPhone}</p>
              </div>
              <div className="text-right">
                <p className="text-ink-muted">Claimed amount</p>
                <p className="text-[17px] font-semibold text-ink tabular">
                  {proof && formatPKR(proof.amount)}
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofTarget(null)}>
              Close
            </Button>
            {proof?.status === "submitted" && canVerify && (
              <>
                <Button
                  variant="danger-outline"
                  onClick={() => {
                    setProofTarget(null);
                    setRejectTarget(proof.id);
                  }}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => {
                    handleApprove(proof.id);
                    setProofTarget(null);
                  }}
                >
                  Approve payment
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject payment proof</DialogTitle>
            <DialogDescription>
              {rejectSubmission && `Rejecting proof for ${rejectSubmission.orderNumber}.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
              <FileWarning className="mb-1 h-4 w-4" />
              Explain why this receipt cannot be verified (e.g. incorrect amount, unreadable photo,
              invalid reference).
            </div>
            <div>
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Transaction ID was not found in our JazzCash merchant portal."
                className="mt-1"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim() || isSubmitting}
              onClick={handleReject}
            >
              {isSubmitting ? "Rejecting..." : "Reject payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmissionList({
  items,
  onViewProof,
  onApprove,
  onReject,
  emptyState,
}: {
  items: PaymentSubmission[];
  onViewProof: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  emptyState: React.ReactNode;
}) {
  if (items.length === 0) return <>{emptyState}</>;

  return (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
          <button
            onClick={() => onViewProof(item.id)}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted"
            aria-label="View payment proof"
          >
            <Image src={item.proofUrl} alt="Payment proof" fill unoptimized sizes="80px" className="object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-navy-900/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Eye className="h-4 w-4 text-white" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/orders/${item.orderId}`}
                className="font-mono text-[12.5px] font-semibold text-brand-700 hover:underline"
              >
                {item.orderNumber}
              </Link>
              <Badge variant="navy">{PAYMENT_METHOD_LABEL[item.method] || item.method}</Badge>
              {item.status === "submitted" && <Badge variant="warning">Needs review</Badge>}
              {item.status === "approved" && <Badge variant="success">Approved</Badge>}
              {item.status === "rejected" && <Badge variant="danger">Rejected</Badge>}
              {item.isDuplicate && (
                <Badge variant="danger" className="border border-rose-300 bg-rose-50 text-rose-700 font-semibold">
                  Duplicate Reference
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar name={item.customerName} size="sm" />
              <div>
                <p className="text-[12.5px] font-medium text-ink">{item.customerName}</p>
                <p className="text-[11.5px] text-ink-muted">{item.customerPhone}</p>
              </div>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-muted">
              Ref: <span className="font-mono text-ink-soft">{item.transactionRef}</span> ·{" "}
              {formatDateTime(item.submittedAt)}
              {item.rejectionReason && (
                <span className="ml-1 text-rose-600">— {item.rejectionReason}</span>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end">
            <p className="text-[17px] font-semibold text-ink tabular">{formatPKR(item.amount)}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onViewProof(item.id)}>
                <Eye className="h-3.5 w-3.5" />
                Proof
              </Button>
              {item.status === "submitted" && onApprove && (
                <Button
                  size="sm"
                  onClick={() => onApprove(item.id)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
              )}
              {item.status === "submitted" && onReject && (
                <Button variant="danger-outline" size="sm" onClick={() => onReject(item.id)}>
                  Reject
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
