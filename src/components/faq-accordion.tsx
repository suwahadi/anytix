"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "@/components/icons";

type Item = { id: number; question: string; answer: string };

/** One answer open at a time; rows animate through grid-template-rows so no height is measured in JS, and closed panels are inert. */
export function FaqAccordion({ items }: { items: Item[] }) {
  const uid = useId();
  const [open, setOpen] = useState<number | null>(items[0]?.id ?? null);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => {
        const expanded = open === item.id;
        const button = `${uid}-q-${item.id}`;
        const panel = `${uid}-a-${item.id}`;
        return (
          <div key={item.id}>
            <h2>
              <button
                id={button}
                type="button"
                aria-expanded={expanded}
                aria-controls={panel}
                onClick={() => setOpen(expanded ? null : item.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-4 text-left text-base font-semibold text-text hover:bg-surface-muted focus-visible:bg-surface-muted sm:px-5"
              >
                <span>{item.question}</span>
                <span
                  aria-hidden
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-300 ease-out motion-reduce:transition-none ${
                    expanded ? "rotate-180 bg-accent text-on-accent" : "bg-surface-muted text-muted"
                  }`}
                >
                  <ChevronDownIcon className="size-5" />
                </span>
              </button>
            </h2>
            <div
              id={panel}
              role="region"
              aria-labelledby={button}
              inert={!expanded}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <div className="rich-text px-4 pb-5 text-text sm:px-5" dangerouslySetInnerHTML={{ __html: item.answer }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
