'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  History,
  PackageSearch,
  PencilLine,
  SearchX,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { StockBadge } from "../components/shared/status-badges";
import { useToast } from "../components/ui/toast";
import { formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { InventoryMovement, InventoryMovementType, Product, ProductVariant } from "../lib/types";
import { adjustStockAction } from "../actions/inventory";

type StockFilter = "all" | "low" | "out" | "healthy";

const MOVEMENT_META: Record<InventoryMovementType, { label: string; variant: "success" | "danger" | "info" | "warning" | "neutral" }> = {
  restock: { label: "Restock", variant: "success" },
  sale: { label: "Sale", variant: "info" },
  cancellation: { label: "Cancellation", variant: "warning" },
  return: { label: "Return", variant: "neutral" },
  adjustment: { label: "Adjustment", variant: "danger" },
};

interface InventoryProps {
  initialRows?: { product: Product; variant: ProductVariant }[];
  initialMovements?: InventoryMovement[];
  initialTotals?: {
    units: number;
    value: number;
    low: number;
    out: number;
    reserved: number;
    skus: number;
  };
  initialPagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
}

export default function InventoryPage({
  initialRows = [],
  initialMovements = [],
  initialTotals,
  initialPagination,
}: InventoryProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [adjustTarget, setAdjustTarget] = useState<{ product: Product; variant: ProductVariant } | null>(null);
  const [adjustMode, setAdjustMode] = useState<"set" | "add" | "remove">("add");
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("Restock from supplier");
  const [adjustNote, setAdjustNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rows, setRows] = useState(initialRows);
  const [movements, setMovements] = useState(initialMovements);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setMovements(initialMovements);
  }, [initialMovements]);

  const totals = useMemo(() => {
    if (initialTotals) return initialTotals;
    const units = rows.reduce((sum, r) => sum + r.variant.stock, 0);
    const value = rows.reduce((sum, r) => sum + r.variant.stock * r.variant.price, 0);
    const low = rows.filter(
      (r) => r.variant.stock > 0 && r.variant.stock <= r.variant.reorderLevel,
    ).length;
    const out = rows.filter((r) => r.variant.stock === 0).length;
    const reserved = rows.reduce((sum, r) => sum + r.variant.reserved, 0);
    return { units, value, low, out, reserved, skus: rows.length };
  }, [rows, initialTotals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ product, variant }) => {
      const matchesQuery =
        !q ||
        product.name.toLowerCase().includes(q) ||
        variant.sku.toLowerCase().includes(q) ||
        variant.colorName.toLowerCase().includes(q) ||
        variant.size.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "low" && variant.stock > 0 && variant.stock <= variant.reorderLevel) ||
        (filter === "out" && variant.stock === 0) ||
        (filter === "healthy" && variant.stock > variant.reorderLevel);
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openAdjust = (
    product: Product,
    variant: ProductVariant,
    mode: "set" | "add" | "remove",
  ) => {
    setAdjustTarget({ product, variant });
    setAdjustMode(mode);
    setAdjustQty(mode === "add" ? 10 : 0);
    setAdjustReason(
      mode === "add" ? "Restock from supplier" : mode === "remove" ? "Manual adjustment" : "Stock count correction",
    );
    setAdjustNote("");
  };

  const applyAdjust = async () => {
    if (!adjustTarget) return;
    const { product, variant } = adjustTarget;

    const next =
      adjustMode === "set"
        ? adjustQty
        : adjustMode === "add"
          ? variant.stock + adjustQty
          : variant.stock - adjustQty;
    if (next < 0) {
      toast({ title: "Stock cannot go below zero", variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await adjustStockAction({
        variantId: variant.id,
        mode: adjustMode,
        quantity: adjustQty,
        reason: adjustMode === "add" ? "restock" : "adjustment",
        notes: adjustNote ? `${adjustReason} - ${adjustNote}` : adjustReason,
      });

      if (res.success) {
        toast({
          title: "Inventory updated",
          description: `${product.name} · ${variant.name} is now at ${next} units.`,
        });
        setAdjustTarget(null);
        router.refresh();
      } else {
        toast({
          title: "Failed to update inventory",
          description: res.error || "An unexpected error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error adjusting stock",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const stats = [
    { label: "Units in stock", value: String(totals.units), icon: Boxes, tone: "brand" },
    { label: "Stock value", value: formatPKR(totals.value), icon: TrendingUp, tone: "navy" },
    { label: "Low stock SKUs", value: String(totals.low), icon: TrendingDown, tone: "amber" },
    { label: "Out of stock SKUs", value: String(totals.out), icon: PackageSearch, tone: "rose" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
        description="Monitor stock across every variant, adjust quantities and review movement history."
        actions={
          <Badge variant="neutral">
            {totals.reserved} units reserved across orders
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
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.tone === "brand" && "bg-brand-50 text-brand-600",
                  stat.tone === "navy" && "bg-navy-50 text-navy-600",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600",
                  stat.tone === "rose" && "bg-rose-50 text-rose-600",
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
          <Tabs defaultValue="levels">
            <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="levels">
                  <Boxes className="h-3.5 w-3.5" />
                  Stock levels
                </TabsTrigger>
                <TabsTrigger value="movements">
                  <History className="h-3.5 w-3.5" />
                  Movement history
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    setPage(1);
                  }}
                  placeholder="Filter by product, SKU, colour…"
                  className="w-full sm:w-64"
                />
                <Select
                  value={filter}
                  onValueChange={(v) => {
                    setFilter(v as StockFilter);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stock</SelectItem>
                    <SelectItem value="low">Low stock only</SelectItem>
                    <SelectItem value="out">Out of stock</SelectItem>
                    <SelectItem value="healthy">Healthy stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="levels" className="p-0">
              {visible.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={<SearchX className="h-5 w-5" />}
                  title="No variants found"
                  description="Try adjusting your filter or search query."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map(({ product, variant }) => {
                        const available = Math.max(0, variant.stock - variant.reserved);
                        return (
                          <TableRow key={variant.id}>
                            <TableCell className="font-medium text-ink">
                              {product.name}
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2 text-ink">
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-line-strong"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                                {variant.colorName} / {variant.size}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">{variant.sku}</TableCell>
                            <TableCell className="text-right tabular">{formatPKR(variant.price)}</TableCell>
                            <TableCell className="text-right font-medium tabular text-ink">
                              {variant.stock}
                            </TableCell>
                            <TableCell className="text-right tabular text-ink-muted">
                              {variant.reserved}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular text-ink">
                              {available}
                            </TableCell>
                            <TableCell>
                              <StockBadge
                                stock={variant.stock}
                                reorderLevel={variant.reorderLevel}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openAdjust(product, variant, "add")}
                                  title="Add incoming stock"
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                  Restock
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openAdjust(product, variant, "set")}
                                  title="Set exact stock level"
                                >
                                  <PencilLine className="h-3.5 w-3.5" />
                                  Count
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={initialPagination ? initialPagination.currentPage : safePage}
                    pageSize={initialPagination ? initialPagination.limit : pageSize}
                    total={initialPagination ? initialPagination.totalItems : filtered.length}
                    onPageChange={(newPage) => {
                      setPage(newPage);
                      if (initialPagination) {
                        router.push(`?page=${newPage}&limit=${pageSize}`);
                      }
                    }}
                    onPageSizeChange={(s) => {
                      setPageSize(s);
                      setPage(1);
                      if (initialPagination) {
                        router.push(`?page=1&limit=${s}`);
                      }
                    }}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="movements" className="p-0">
              {movements.length === 0 ? (
                <EmptyState
                  className="m-4"
                  title="No movement history"
                  description="Stock adjustments, orders and restocks will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & time</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Initiator</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => {
                      const meta = MOVEMENT_META[m.type];
                      const isPositive = m.quantity > 0;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-[12.5px] tabular text-ink-muted">
                            {formatDateTime(m.at)}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-ink">{m.productName}</p>
                            <p className="text-[11.5px] text-ink-muted">
                              {m.variantName}
                            </p>
                          </TableCell>
                          <TableCell className="font-mono text-[12px]">{m.sku}</TableCell>
                          <TableCell>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono text-[13px] font-semibold tabular",
                              isPositive ? "text-emerald-700" : "text-rose-700",
                            )}
                          >
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </TableCell>
                          <TableCell className="text-[12.5px] text-ink">{m.reason}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-[12px] text-ink-muted">
                            {m.note ?? "—"}
                          </TableCell>
                          <TableCell className="text-[12.5px] text-ink-muted">{m.by}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustMode === "add"
                ? "Restock inventory"
                : adjustMode === "remove"
                  ? "Deduct inventory"
                  : "Set exact stock count"}
            </DialogTitle>
            <DialogDescription>
              {adjustTarget && `${adjustTarget.product.name} · ${adjustTarget.variant.name}`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label>Adjustment mode</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={adjustMode === "add" ? "default" : "outline"}
                  onClick={() => setAdjustMode("add")}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={adjustMode === "remove" ? "default" : "outline"}
                  onClick={() => setAdjustMode("remove")}
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                  Remove
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={adjustMode === "set" ? "default" : "outline"}
                  onClick={() => setAdjustMode("set")}
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Set count
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="current-stock">Current stock</Label>
                <Input
                  id="current-stock"
                  disabled
                  value={adjustTarget?.variant.stock ?? 0}
                  className="bg-surface-muted"
                />
              </div>
              <div>
                <Label htmlFor="adjust-qty">
                  {adjustMode === "set" ? "New quantity" : "Adjustment quantity"}
                </Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={0}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>

            <div>
              <Label>Reason</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Restock from supplier">Restock from supplier</SelectItem>
                  <SelectItem value="Manual adjustment">Manual adjustment</SelectItem>
                  <SelectItem value="Stock count correction">Stock count correction</SelectItem>
                  <SelectItem value="Damaged / write-off">Damaged / write-off</SelectItem>
                  <SelectItem value="Customer exchange">Customer exchange</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="adjust-note">Internal notes (optional)</Label>
              <Textarea
                id="adjust-note"
                rows={2}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reference PO number, courier bag or batch tag…"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button onClick={applyAdjust} disabled={isSubmitting}>
              {isSubmitting ? "Applying..." : "Apply adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
