"use client";

import TiptapImage from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { mediaUrl } from "@/lib/media";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/upload-client";
import { Spinner } from "./ui/spinner";

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
  imageKind,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  error?: string;
  hint?: string;
  /** Turns on the image button; images upload under this media kind and only those paths survive sanitizing. */
  imageKind?: "page";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      ...(imageKind ? [TiptapImage.configure({ allowBase64: false })] : []),
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

  async function insertImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor || !imageKind) return;
    setUploadError("");
    setUploading(true);
    const result = await uploadImage(file, imageKind);
    setUploading(false);
    if ("error" in result) return setUploadError(result.error);
    const alt = window.prompt("Deskripsi singkat gambar untuk pembaca layar", "") ?? "";
    editor.chain().focus().setImage({ src: mediaUrl(result.base, "lg"), alt: alt.trim() }).run();
  }

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
          {imageKind && (
            <>
              <button
                type="button"
                title="Sisipkan gambar"
                aria-label="Sisipkan gambar"
                disabled={!editor || uploading}
                aria-busy={uploading || undefined}
                onClick={() => fileInput.current?.click()}
                className="inline-flex min-h-9 min-w-9 items-center gap-1.5 rounded px-2 text-sm text-text hover:bg-surface-muted disabled:opacity-50"
              >
                {uploading && <Spinner />}
                Gambar
              </button>
              <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} onChange={insertImage} className="sr-only" tabIndex={-1} aria-hidden />
            </>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
      {uploadError && (
        <p role="alert" className="text-sm text-danger">
          {uploadError}
        </p>
      )}
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
