export default function OrderDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Header skeleton */}
      <div className="flex flex-col gap-2 pb-4 border-b border-line sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-4 w-28 bg-surface-muted rounded" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-48 bg-surface-muted rounded" />
            <div className="h-6 w-20 bg-surface-muted rounded-full" />
            <div className="h-6 w-24 bg-surface-muted rounded-full" />
          </div>
          <div className="h-4 w-64 bg-surface-muted rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 bg-surface-muted rounded" />
          <div className="h-9 w-32 bg-surface-muted rounded" />
        </div>
      </div>

      {/* Lifecycle Banner skeleton */}
      <div className="h-16 rounded-xl border border-line bg-surface p-4" />

      {/* Grid: main + sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Order items table skeleton */}
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-32 bg-surface-muted rounded" />
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-line last:border-0">
                  <div className="h-12 w-12 rounded-lg bg-surface-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-surface-muted rounded" />
                    <div className="h-3 w-32 bg-surface-muted rounded" />
                  </div>
                  <div className="h-4 w-16 bg-surface-muted rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Timeline skeleton */}
          <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
            <div className="h-5 w-40 bg-surface-muted rounded" />
            <div className="h-20 bg-surface-muted/60 rounded" />
          </div>
        </div>

        {/* Sidebar cards skeleton */}
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-36 bg-surface-muted rounded" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-surface-muted rounded" />
              <div className="h-4 w-3/4 bg-surface-muted rounded" />
              <div className="h-4 w-1/2 bg-surface-muted rounded" />
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <div className="h-5 w-36 bg-surface-muted rounded" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-surface-muted rounded" />
              <div className="h-4 w-2/3 bg-surface-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
