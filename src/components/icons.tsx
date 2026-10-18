import type { ReactNode } from "react";

function Svg({ className = "size-5", children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function CalendarIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </Svg>
  );
}

export function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 5v14M15 5v14" />
    </Svg>
  );
}

export function PlayIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M7 5v14l11-7z" />
    </Svg>
  );
}

export function MenuIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
