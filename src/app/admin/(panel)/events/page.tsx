import type { Metadata } from "next";
import { EventsTable } from "./events-table";

export const metadata: Metadata = { title: "Event", robots: { index: false, follow: false } };

export default function EventsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-text">Event</h1>
      <EventsTable />
    </>
  );
}
