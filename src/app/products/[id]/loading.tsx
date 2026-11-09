export default function ProductViewLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 pb-4 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-surface-muted rounded" />
          <div className="h-8 w-64 bg-surface-muted rounded" />
          <div className="h-4 w-80 bg-surface-muted rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-20 bg-surface-muted rounded" />
          <div className="h-9 w-24 bg-surface-muted rounded" />
          <div className="h-9 w-24 bg-surface-muted rounded" />
        </div>
      </div>

      {/* Main content grid: Gallery left, details right */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
          <div className="h-80 w-full rounded-lg bg-surface-muted" />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 w-16 rounded-md bg-surface-muted" />
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-40 bg-surface-muted rounded" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-surface-muted rounded" />
              <div className="h-4 w-5/6 bg-surface-muted rounded" />
              <div className="h-4 w-2/3 bg-surface-muted rounded" />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-32 bg-surface-muted rounded" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 w-full bg-surface-muted/60 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
