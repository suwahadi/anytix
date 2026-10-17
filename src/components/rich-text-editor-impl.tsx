"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";

type Tool = {
  label: string;
  content: ReactNode;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
};

const TOOLS: Tool[] = [
  { label: "Tebal", content: <strong>B</strong>, run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
  { label: "Miring", content: <em>I</em>, run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
  {
    label: "Judul besar",
    content: "H2",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    label: "Judul kecil",
    content: "H3",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (e) => e.isActive("heading", { level: 3 }),
  },
  { label: "Daftar berpoin", content: "• Daftar", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
  { label: "Daftar bernomor", content: "1. Daftar", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
  {
    label: "Tautan",
    content: "Tautan",
    run: (e) => {
      const current = e.getAttributes("link").href as string | undefined;
      const href = window.prompt("Alamat tautan (kosongkan untuk menghapus)", current ?? "https://");
      if (href === null) return;
      if (href.trim() === "" || href.trim() === "https://") e.chain().focus().extendMarkRange("link").unsetLink().run();
      else e.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    },
    active: (e) => e.isActive("link"),
  },
  { label: "Urungkan", content: "Urungkan", run: (e) => e.chain().focus().undo().run() },
  { label: "Ulangi", content: "Ulangi", run: (e) => e.chain().focus().redo().run() },
];

export default function RichTextEditorImpl({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  error?: string;
  hint?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": `${id}-label`,
        ...(hint || error ? { "aria-describedby": [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") } : {}),
        class: "rich-text min-h-40 px-3 py-2 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? TOOLS.map((t) => t.active?.(editor) ?? false) : TOOLS.map(() => false)),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text">
        {label}
      </span>
      <div
        className={`rounded-md border bg-surface focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus ${
          error ? "border-danger" : "border-border-strong"
        }`}
      >
        <div role="toolbar" aria-label={`Format ${label.toLowerCase()}`} className="flex flex-wrap gap-1 border-b border-border p-1">
          {TOOLS.map((tool, i) => (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={tool.active ? Boolean(active?.[i]) : undefined}
              disabled={!editor}
              onClick={() => editor && tool.run(editor)}
              className="min-h-9 min-w-9 rounded px-2 text-sm text-text hover:bg-surface-muted aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:opacity-50"
            >
              {tool.content}
            </button>
          ))}
        </div>
        <EditorContent editor={editor} />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
