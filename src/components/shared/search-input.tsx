import { Search } from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  onKeyDown,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit?: () => void;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
