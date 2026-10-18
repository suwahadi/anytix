"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { reset: () => void };

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile; a token is single use, so callers clear their copy and reset() after every request that consumed it.
 * `interaction-only` keeps the widget invisible unless Cloudflare asks the visitor to tick it, so the caller must place it where it will be seen.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  onInteractive,
  appearance = "always",
  className = "min-h-[65px]",
  ref,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
  /** Called with true when Cloudflare shows the checkbox and false once the visitor has answered it. */
  onInteractive?: (shown: boolean) => void;
  appearance?: "always" | "interaction-only";
  className?: string;
  ref?: Ref<TurnstileHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  const failed = useRef(onError);
  const interactive = useRef(onInteractive);
  useEffect(() => {
    callback.current = onToken;
    failed.current = onError;
    interactive.current = onInteractive;
  });

  useImperativeHandle(ref, () => ({
    reset() {
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: "id",
          theme: "auto",
          appearance,
          callback: (t: string) => callback.current(t),
          "expired-callback": () => callback.current(""),
          "error-callback": () => {
            callback.current("");
            failed.current?.();
          },
          "before-interactive-callback": () => interactive.current?.(true),
          "after-interactive-callback": () => interactive.current?.(false),
          "timeout-callback": () => {
            callback.current("");
            failed.current?.();
          },
        });
      })
      .catch(() => {
        callback.current("");
        failed.current?.();
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, appearance]);

  return <div ref={box} className={className} />;
}
