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

export function ClockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function MapPinIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

export function MailIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

export function FilterIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z" />
    </Svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function PencilIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
    </Svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  );
}

export function LogoutIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </Svg>
  );
}

/** WhatsApp brand glyph (Simple Icons). The padded viewBox shrinks the full-bleed mark to the optical size of the stroked icons beside it. */
export function WhatsAppIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="-4 -4 32 32" className={className} aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function MusicIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </Svg>
  );
}

export function FrameIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </Svg>
  );
}

export function MaskIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 4h16v7a8 8 0 0 1-16 0V4z" />
      <path d="M8.5 9h1M14.5 9h1M9 14.5a4 4 0 0 0 6 0" />
    </Svg>
  );
}

export function BallIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8" />
    </Svg>
  );
}

export function MountainIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m3 20 6.5-11 4 6.5L16 12l5 8H3z" />
      <circle cx="17" cy="6" r="2" />
    </Svg>
  );
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </Svg>
  );
}

export function ToolIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14.5 5.5a4 4 0 0 0 5 5L21 12l-9 9-3-3 9-9-1.5-1.5a4 4 0 0 0-5-5L14 4z" />
      <path d="m3 21 4-4" />
    </Svg>
  );
}

export function TrophyIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" />
    </Svg>
  );
}

export function TicketIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3v2z" />
      <path d="M14 6v12" />
    </Svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}
