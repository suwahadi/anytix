"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";

export function RefundDialog({ policy }: { policy: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start py-2 text-sm font-semibold text-accent-text underline underline-offset-4"
      >
        Kebijakan Refund
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Kebijakan Refund">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text">{policy}</p>
      </Dialog>
    </>
  );
}
