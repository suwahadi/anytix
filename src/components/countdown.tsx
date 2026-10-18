"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown, remainingMs } from "@/lib/booking/countdown";

export function Countdown({
  expiresAt,
  serverNow,
  receivedAt,
  onExpire,
  className = "",
}: {
  expiresAt: string;
  serverNow: string;
  receivedAt: number;
  onExpire?: () => void;
  className?: string;
}) {
  const [left, setLeft] = useState(() => remainingMs(expiresAt, serverNow, receivedAt, receivedAt));
  const expired = useRef(false);
  const notify = useRef(onExpire);
  useEffect(() => {
    notify.current = onExpire;
  });

  useEffect(() => {
    expired.current = false;
    const tick = () => {
      const ms = remainingMs(expiresAt, serverNow, receivedAt, Date.now());
      setLeft(ms);
      if (ms === 0 && !expired.current) {
        expired.current = true;
        notify.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, serverNow, receivedAt]);

  const minutes = Math.ceil(left / 60_000);
  return (
    <span className={className}>
      <span aria-hidden className={`text-lg font-bold tabular-nums ${left < 60_000 ? "text-danger" : ""}`}>
        {formatCountdown(left)}
      </span>
      <span className="sr-only" aria-live="polite">
        {left === 0 ? "Waktu habis" : left < 60_000 ? "Kurang dari satu menit" : `${minutes} menit tersisa`}
      </span>
    </span>
  );
}
