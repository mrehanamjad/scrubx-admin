import Image from "next/image";
import { cn, isAllowedImageHost } from "../../lib/utils";

export function ProductThumb({
  src,
  alt,
  size = "md",
  className,
}: {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 rounded-md",
    md: "h-11 w-11 rounded-lg",
    lg: "h-16 w-16 rounded-lg",
    xl: "h-24 w-24 rounded-xl",
  };
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-line bg-surface-muted flex items-center justify-center",
        sizes[size],
        className,
      )}
    >
      {src && isAllowedImageHost(src) ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 96px"
          className="object-cover"
        />
      ) : (
        <span className="text-[10px] font-medium text-ink-muted select-none">
          {alt.slice(0, 2).toUpperCase() || "SX"}
        </span>
      )}
    </div>
  );
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-[11px]",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-100",
        sizes[size],
        className,
      )}
    >
      {initials || "?"}
    </div>
  );
}
