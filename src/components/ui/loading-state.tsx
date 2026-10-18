/** Centered spinner for a Suspense fallback; it fades in after 400 ms so quick loads show only the skeleton beneath. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="pointer-events-none absolute inset-0 flex animate-[pending-in_200ms_ease-out_400ms_both] items-start justify-center pt-24">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface/90 px-6 py-5 shadow-sm">
        <span aria-hidden className="size-9 animate-spin rounded-full border-4 border-accent/25 border-t-accent motion-reduce:animate-[spin_1.6s_linear_infinite]" />
        <p className="text-sm font-semibold text-text">{label}</p>
      </div>
    </div>
  );
}
