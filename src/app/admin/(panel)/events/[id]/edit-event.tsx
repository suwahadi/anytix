"use client";

import { useParams } from "next/navigation";
import { EventForm } from "../event-form";
import { EventTabs } from "./event-tabs";

export function EditEvent() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <EventTabs active="detail" />
      <h1 className="mt-4 text-2xl font-bold text-text">Detail event</h1>
      <EventForm eventId={Number(id)} />
    </>
  );
}
