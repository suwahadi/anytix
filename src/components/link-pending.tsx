"use client";

import { useLinkStatus } from "next/link";

/** Put inside a <Link> with `relative`: a spinner appears at its right edge while that navigation is still waiting on the server. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-current border-r-transparent transition-opacity ${pending ? "opacity-100 delay-200" : "opacity-0"}`}
    />
  );
}
