"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./ui/skeleton";

/** Tiptap reads Math.random() while rendering, which Cache Components rejects during prerender, so it renders in the browser only. */
export const RichTextEditor = dynamic(() => import("./rich-text-editor-impl"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-1.5" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-52" />
    </div>
  ),
});
