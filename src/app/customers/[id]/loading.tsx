export default function CustomerDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 pb-4 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-surface-muted shrink-0" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-surface-muted rounded" />
            <div className="flex items-center gap-3">
              <div className="h-7 w-48 bg-surface-muted rounded" />
              <div className="h-5 w-20 bg-surface-muted rounded-full" />
            </div>
            <div className="h-4 w-60 bg-surface-muted rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-surface-muted rounded" />
          <div className="h-9 w-28 bg-surface-muted rounded" />
        </div>
      </div>

      {/* Grid: Main column + side column */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {/* Stat cards skeleton */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-line bg-surface p-4" />
            ))}
          </div>

          {/* Orders table skeleton */}
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-32 bg-surface-muted rounded" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 w-full bg-surface-muted/60 rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar notes & profile skeleton */}
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
            <div className="h-5 w-28 bg-surface-muted rounded" />
            <div className="h-16 bg-surface-muted/60 rounded" />
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
            <div className="h-5 w-28 bg-surface-muted rounded" />
            <div className="h-24 bg-surface-muted/60 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
