export default function ProductEditLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 pb-4 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-28 bg-surface-muted rounded" />
          <div className="h-8 w-56 bg-surface-muted rounded" />
          <div className="h-4 w-72 bg-surface-muted rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-surface-muted rounded" />
          <div className="h-9 w-28 bg-surface-muted rounded" />
        </div>
      </div>

      {/* 2-column form layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-32 bg-surface-muted rounded" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-10 bg-surface-muted rounded" />
              <div className="h-10 bg-surface-muted rounded" />
            </div>
            <div className="h-24 bg-surface-muted rounded" />
          </div>

          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-28 bg-surface-muted rounded" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 w-28 bg-surface-muted rounded" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-32 bg-surface-muted rounded" />
            <div className="h-20 bg-surface-muted/60 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
