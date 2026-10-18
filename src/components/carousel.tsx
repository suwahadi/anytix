"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { shouldAutoplay } from "@/lib/carousel";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(callback: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

const ARROW =
  "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted sm:inline-flex";

/** Centred mode: itemClassName sets `--slide` (the slide width); edge margins resolve against the track width so first and last slides can sit in the middle. */
const CENTER_EDGES = "first:ml-[calc((100%-var(--slide))/2)] last:mr-[calc((100%-var(--slide))/2)]";

export function Carousel({
  label,
  items,
  itemClassName,
  dots = false,
  autoplayMs,
  center = false,
}: {
  label: string;
  items: ReactNode[];
  itemClassName: string;
  dots?: boolean;
  autoplayMs?: number;
  center?: boolean;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => true);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    const children = [...el.children] as HTMLElement[];
    const middle = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    children.forEach((child, i) => {
      const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - middle);
      const best = Math.abs(children[nearest].offsetLeft + children[nearest].offsetWidth / 2 - middle);
      if (d < best) nearest = i;
    });
    setActive(center ? nearest : Math.round(el.scrollLeft / Math.max(1, children[0]?.offsetWidth ?? 1)));
  }, [center]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const goTo = useCallback(
    (index: number) => {
      const el = track.current;
      const target = el?.children[index] as HTMLElement | undefined;
      if (!el || !target) return;
      const left = center ? target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2 : target.offsetLeft - el.offsetLeft;
      el.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [center, reducedMotion],
  );

  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    if (center) return goTo(Math.min(items.length - 1, Math.max(0, active + dir)));
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const running = shouldAutoplay({ enabled: Boolean(autoplayMs), reducedMotion, paused, hovered, focused, touched, slideCount: items.length });

  useEffect(() => {
    if (!running || !autoplayMs) return;
    const timer = setInterval(() => goTo(active + 1 >= items.length ? 0 : active + 1), autoplayMs);
    return () => clearInterval(timer);
  }, [running, autoplayMs, active, items.length, goTo]);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onPointerDown={(e) => e.pointerType !== "mouse" && setTouched(true)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}
    >
      <ul
        ref={track}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <li
            key={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} dari ${items.length}`}
            className={`shrink-0 ${center ? `snap-center ${CENTER_EDGES}` : "snap-start"} ${itemClassName}`}
          >
            {item}
          </li>
        ))}
      </ul>

      {edges.prev && (
        <button type="button" onClick={() => step(-1)} aria-label="Sebelumnya" className={`${ARROW} left-1 sm:-left-3`}>
          <ChevronLeftIcon />
        </button>
      )}
      {edges.next && (
        <button type="button" onClick={() => step(1)} aria-label="Berikutnya" className={`${ARROW} right-1 sm:-right-3`}>
          <ChevronRightIcon />
        </button>
      )}

      {(dots || autoplayMs) && items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          {autoplayMs && !reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Putar slide" : "Jeda slide"}
              className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-text"
            >
              {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
            </button>
          )}
          {dots &&
            items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Ke slide ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className="inline-flex h-11 items-center justify-center px-1"
              >
                <span className={`block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${i === active ? "w-6 bg-accent" : "w-2 bg-border-strong"}`} />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
