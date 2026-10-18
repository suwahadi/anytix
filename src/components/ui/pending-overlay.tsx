/**
 * Full-screen wait indicator for a submit that ends in a navigation (hold → checkout, pay → order).
 * It fades in only after 400 ms, so a fast response never flashes it, and it never delays the request itself.
 */
export function PendingOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex animate-[pending-in_200ms_ease-out_400ms_both] items-center justify-center bg-bg/75 px-6 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface px-8 py-6 text-center shadow-lg">
        <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-accent/25 border-t-accent motion-reduce:animate-[spin_1.6s_linear_infinite]" />
        <p className="text-sm font-semibold text-text">{label}</p>
      </div>
    </div>
  );
}
