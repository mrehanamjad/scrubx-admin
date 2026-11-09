const pkrFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 0,
});

export function formatPKR(value: number, opts?: { compact?: boolean }) {
  const n = Math.round(value || 0);
  if (opts?.compact && Math.abs(n) >= 100000) {
    return `Rs. ${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  }
  return `Rs. ${pkrFormatter.format(n)}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PK").format(value);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatRelativeTime(input: string | Date): string {
  try {
    const then = typeof input === "string" ? new Date(input).getTime() : input.getTime();
    if (isNaN(then)) return "";
    const diff = Date.now() - then;
    const diffInSeconds = Math.round(diff / 1000);
    const diffInMinutes = Math.round(diffInSeconds / 60);
    const diffInHours = Math.round(diffInMinutes / 60);
    const diffInDays = Math.round(diffInHours / 24);

    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (Math.abs(diffInSeconds) < 60) return "just now";
    if (Math.abs(diffInMinutes) < 60) return rtf.format(-diffInMinutes, "minute");
    if (Math.abs(diffInHours) < 24) return rtf.format(-diffInHours, "hour");
    if (Math.abs(diffInDays) < 30) return rtf.format(-diffInDays, "day");
    return formatDate(typeof input === "string" ? input : input.toISOString());
  } catch {
    return relativeTime(typeof input === "string" ? input : input.toISOString());
  }
}

export function daysAgo(days: number, hour = 11, minute = 30) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
