import { ChevronRightIcon } from "@/components/icons";

const STEPS = ["Pilih Tiket", "Detail Pesanan", "Metode Pembayaran", "Pembayaran"] as const;

/** Full-width order progress band; phones keep only the current step's label so four steps fit one row. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Langkah pemesanan" className="bg-accent text-on-accent">
      <ol className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 md:justify-center md:gap-3">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const isCurrent = n === current;
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex items-center gap-2 md:gap-3">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    isCurrent ? "border-on-accent bg-on-accent text-accent" : "border-on-accent/85 text-on-accent/85"
                  }`}
                >
                  {n}
                </span>
                <span className={`whitespace-nowrap text-sm font-semibold ${isCurrent ? "" : "sr-only text-on-accent/85 md:not-sr-only"}`}>{label}</span>
              </span>
              {n < STEPS.length && <ChevronRightIcon className="size-4 shrink-0 text-on-accent/85 max-[359px]:hidden" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
