'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SearchX, UserRound, Users } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { Avatar } from "../components/shared/thumb";
import { formatDate, formatPKR } from "../lib/format";
import type { Customer } from "../lib/types";

type SortKey = "newest" | "spend-desc" | "orders-desc" | "name";

interface CustomersProps {
  initialCustomers?: Customer[];
  initialCustomerStats?: Record<string, { orders: number; spend: number }>;
  initialRegisteredCount?: number;
  initialGuestCount?: number;
  initialLifetimeValue?: number;
  initialPagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    limit: number;
  };
  initialQuery?: string;
}

export default function CustomersPage({
  initialCustomers = [],
  initialCustomerStats = {},
  initialRegisteredCount = 0,
  initialGuestCount = 0,
  initialLifetimeValue = 0,
  initialPagination,
  initialQuery = "",
}: CustomersProps) {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);

  useEffect(() => {
    setCustomers(initialCustomers);
  }, [initialCustomers]);

  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSearchSubmit = () => {
    const q = query.trim();
    router.replace(q ? `/customers?q=${encodeURIComponent(q)}` : "/customers");
  };
  const [type, setType] = useState<"all" | "registered" | "guest">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const stats = useMemo(() => {
    const map = new Map<string, { orders: number; spend: number }>();
    Object.entries(initialCustomerStats).forEach(([id, s]) => {
      map.set(id, s);
    });
    return map;
  }, [initialCustomerStats]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = customers.filter((customer) => {
      const matchesQuery =
        !q ||
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.phone.includes(q) ||
        customer.city.toLowerCase().includes(q);
      const matchesType = type === "all" || customer.type === type;
      return matchesQuery && matchesType;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      const aStats = stats.get(a.id) ?? { orders: 0, spend: 0 };
      const bStats = stats.get(b.id) ?? { orders: 0, spend: 0 };
      switch (sort) {
        case "spend-desc":
          return bStats.spend - aStats.spend;
        case "orders-desc":
          return bStats.orders - aStats.orders;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return +new Date(b.registeredAt) - +new Date(a.registeredAt);
      }
    });
    return sorted;
  }, [customers, query, type, sort, stats]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const registeredCount = initialRegisteredCount || customers.filter((c) => c.type === "registered").length;
  const guestCount = initialGuestCount || (customers.length - registeredCount);
  const lifetimeValue = initialLifetimeValue || customers.reduce(
    (sum, customer) => sum + (stats.get(customer.id)?.spend ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Audience"
        title="Customers"
        description="Profiles, delivery addresses and order history across Pakistan."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="brand">
              <UserRound className="h-3 w-3" />
              {registeredCount} registered
            </Badge>
            <Badge variant="neutral">{guestCount} guest checkouts</Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] font-medium text-ink-muted">Total customers</p>
            <p className="mt-1.5 text-[22px] font-semibold text-ink tabular">
              {customers.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] font-medium text-ink-muted">Account conversion</p>
            <p className="mt-1.5 text-[22px] font-semibold text-brand-700 tabular">
              {customers.length
                ? `${Math.round((registeredCount / customers.length) * 100)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] font-medium text-ink-muted">Lifetime revenue</p>
            <p className="mt-1.5 text-[22px] font-semibold text-ink tabular">
              {formatPKR(lifetimeValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              onSubmit={handleSearchSubmit}
              placeholder="Search by name, email, phone or city…"
              className="w-full lg:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as "all" | "registered" | "guest");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All account types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All account types</SelectItem>
                  <SelectItem value="registered">Registered</SelectItem>
                  <SelectItem value="guest">Guest checkout</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sort}
                onValueChange={(value) => setSort(value as SortKey)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest joined</SelectItem>
                  <SelectItem value="spend-desc">Highest spend</SelectItem>
                  <SelectItem value="orders-desc">Most orders</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<SearchX className="h-5 w-5" />}
              title="No customers match your filter"
              description="Try a different name, phone or city."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setType("all");
                  }}
                >
                  Clear filter
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total spend</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((customer) => {
                    const cStats = stats.get(customer.id) ?? { orders: 0, spend: 0 };
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar name={customer.name} />
                            <div className="min-w-0">
                              <Link
                                href={`/customers/${customer.id}`}
                                className="block max-w-[200px] truncate text-[13px] font-medium text-ink hover:text-brand-700"
                              >
                                {customer.name}
                              </Link>
                              <p className="truncate text-[11.5px] text-ink-muted">
                                {customer.email} · {customer.phone}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{customer.city}</TableCell>
                        <TableCell>
                          <Badge variant={customer.type === "registered" ? "brand" : "neutral"}>
                            {customer.type === "registered" ? "Registered" : "Guest"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {cStats.orders}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-ink tabular">
                          {formatPKR(cStats.spend)}
                        </TableCell>
                        <TableCell className="text-ink-muted">
                          {formatDate(customer.registeredAt)}
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
    </div>
  );
}
