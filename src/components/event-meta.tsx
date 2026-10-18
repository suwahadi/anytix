import { CalendarIcon, ClockIcon, MapPinIcon } from "@/components/icons";

/** Date, time and place on one wrapping line; each item keeps its icon when it drops to the next line on phones. */
export function EventMeta({ date, time, place }: { date: string; time?: string; place?: string }) {
  const items = [
    { key: "date", Icon: CalendarIcon, text: date },
    { key: "time", Icon: ClockIcon, text: time },
    { key: "place", Icon: MapPinIcon, text: place },
  ].filter((i) => i.text);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
      {items.map(({ key, Icon, text }) => (
        <li key={key} className="flex items-center gap-1.5">
          <Icon className="size-4 shrink-0 text-accent-text" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
