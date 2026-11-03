export function TagGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-52 rounded-md" />
      ))}
    </div>
  );
}

export function LoanListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border border-enamel-700 p-4"
        >
          <div className="skeleton h-5 w-1/3 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-3 w-1/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="skeleton h-9 w-56 rounded" />
      <TagGridSkeleton />
    </div>
  );
}

export function DialogFormSkeleton() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50 flex items-center justify-center bg-enamel-950/75 p-4"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-zinc-line bg-enamel-900 p-5">
        <div className="skeleton h-6 w-1/2 rounded" />
        <div className="skeleton h-10 rounded" />
        <div className="skeleton h-10 rounded" />
        <div className="skeleton h-9 w-1/3 rounded" />
      </div>
    </div>
  );
}
