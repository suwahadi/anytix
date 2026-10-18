"use client";

import { useEffect } from "react";

/** The `autofocus` attribute is ignored on elements streamed in after page load, so focus is moved once the client mounts. */
export function FocusOnMount({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.focus();
  }, [id]);
  return null;
}
