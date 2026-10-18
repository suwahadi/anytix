"use client";

import TiptapImage from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { mediaUrl } from "@/lib/media";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/upload-client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Spinner } from "./ui/spinner";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONS = {
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
  italic: <path d="M14 5h-4M14 19h-4M14.5 5l-5 14" />,
  underline: <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />,
  strike: <path d="M5 12h14M16.5 7.5C16 6 14.5 5 12 5c-3 0-4.5 1.5-4.5 3.5 0 1.3.8 2.4 2.5 3M7.5 16.5C8 18 9.6 19 12 19c3 0 4.5-1.6 4.5-3.5" />,
  h2: (
    <>
      <path d="M4 6v12M12 6v12M4 12h8" />
      <path d="M15.5 10a2 2 0 1 1 3.6 1.2L15.5 17h4.5" />
    </>
  ),
  h3: (
    <>
      <path d="M4 6v12M12 6v12M4 12h8" />
      <path d="M15.5 9.5a2 2 0 1 1 2.5 2.5 2 2 0 1 1-2.5 2.5" />
    </>
  ),
  bullet: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  ordered: <path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15.5a1 1 0 1 1 1.7.7L4 18h2" />,
  quote: <path d="M7 7H4v5h3v-1a4 4 0 0 1-3 4M17 7h-3v5h3v-1a4 4 0 0 1-3 4" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
};

type Tool = { key: keyof typeof ICONS; label: string; run: (editor: Editor) => void; active?: (editor: Editor) => boolean };

const GROUPS: Tool[][] = [
  [
    { key: "bold", label: "Tebal", run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
    { key: "italic", label: "Miring", run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
    { key: "underline", label: "Garis bawah", run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive("underline") },
    { key: "strike", label: "Coret", run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive("strike") },
  ],
  [
    { key: "h2", label: "Judul besar", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: (e) => e.isActive("heading", { level: 2 }) },
    { key: "h3", label: "Judul kecil", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), active: (e) => e.isActive("heading", { level: 3 }) },
  ],
  [
    { key: "bullet", label: "Daftar berpoin", run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
    { key: "ordered", label: "Daftar bernomor", run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
    { key: "quote", label: "Kutipan", run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
  ],
];

const HISTORY: Tool[] = [
  { key: "undo", label: "Urungkan", run: (e) => e.chain().focus().undo().run() },
  { key: "redo", label: "Ulangi", run: (e) => e.chain().focus().redo().run() },
];

const TOOL_BUTTON =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text hover:bg-surface-muted aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:opacity-40";
const FIELD = "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text placeholder:text-muted";

function Separator() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}

/** Enter in a dialog field must not submit the page form the editor sits in. */
function onEnter(run: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    run();
  };
}

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
  /** Turns on image upload (button, drop, paste); images upload under this media kind and only those paths survive sanitizing. */
  imageKind?: "page";
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pendingImage, setPendingImage] = useState<{ src: string; alt: string } | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ href: string; existing: boolean } | null>(null);
  const startUpload = useRef<(file: File) => void>(() => {});

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
        class: "rich-text min-h-56 px-4 py-3 focus:outline-none",
      },
      handleDrop: (_view, event) => {
        const file = imageKind ? [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/")) : undefined;
        if (!file) return false;
        event.preventDefault();
        startUpload.current(file);
        return true;
      },
      handlePaste: (_view, event) => {
        const file = imageKind ? [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/")) : undefined;
        if (!file) return false;
        startUpload.current(file);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  async function upload(file: File) {
    if (!imageKind) return;
    setUploadError("");
    setUploading(true);
    const result = await uploadImage(file, imageKind);
    setUploading(false);
    if ("error" in result) return setUploadError(result.error);
    setPendingImage({ src: mediaUrl(result.base, "lg"), alt: "" });
    requestAnimationFrame(() => document.getElementById(`${id}-alt`)?.focus());
  }
  useEffect(() => {
    startUpload.current = (file) => void upload(file);
  });

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(file);
  }

  function insertImage() {
    if (!editor || !pendingImage) return;
    editor.chain().focus().setImage({ src: pendingImage.src, alt: pendingImage.alt.trim() }).run();
    setPendingImage(null);
  }

  function openLink() {
    if (!editor) return;
    const href = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkDraft({ href: href || "https://", existing: Boolean(href) });
    requestAnimationFrame(() => document.getElementById(`${id}-href`)?.focus());
  }

  function saveLink() {
    if (!editor || !linkDraft) return;
    const href = linkDraft.href.trim();
    if (href === "" || href === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
  }

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      marks: GROUPS.flat().map((t) => (editor ? (t.active?.(editor) ?? false) : false)),
      link: editor?.isActive("link") ?? false,
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  });

  let index = 0;

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
        <div
          role="toolbar"
          aria-label={`Format ${label.toLowerCase()}`}
          className="flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-border bg-surface p-1"
        >
          {GROUPS.map((group, g) => (
            <span key={g} className="contents">
              {g > 0 && <Separator />}
              {group.map((tool) => {
                const pressed = Boolean(active?.marks[index++]);
                return (
                  <button
                    key={tool.key}
                    type="button"
                    title={tool.label}
                    aria-label={tool.label}
                    aria-pressed={pressed}
                    disabled={!editor}
                    onClick={() => editor && tool.run(editor)}
                    className={TOOL_BUTTON}
                  >
                    <Glyph>{ICONS[tool.key]}</Glyph>
                  </button>
                );
              })}
            </span>
          ))}
          <Separator />
          <button type="button" title="Tautan" aria-label="Tautan" aria-pressed={Boolean(active?.link)} disabled={!editor} onClick={openLink} className={TOOL_BUTTON}>
            <Glyph>{ICONS.link}</Glyph>
          </button>
          {imageKind && (
            <>
              <button
                type="button"
                title="Sisipkan gambar (atau tarik dan tempel gambar ke editor)"
                aria-label="Sisipkan gambar"
                disabled={!editor || uploading}
                aria-busy={uploading || undefined}
                onClick={() => fileInput.current?.click()}
                className={TOOL_BUTTON}
              >
                {uploading ? <Spinner /> : <Glyph>{ICONS.image}</Glyph>}
              </button>
              <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} onChange={pickFile} className="sr-only" tabIndex={-1} aria-hidden />
            </>
          )}
          <span className="ml-auto flex items-center gap-0.5">
            {HISTORY.map((tool) => (
              <button
                key={tool.key}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                disabled={!editor || !(tool.key === "undo" ? active?.canUndo : active?.canRedo)}
                onClick={() => editor && tool.run(editor)}
                className={TOOL_BUTTON}
              >
                <Glyph>{ICONS[tool.key]}</Glyph>
              </button>
            ))}
          </span>
        </div>
        <EditorContent editor={editor} />
      </div>
      {uploading && <p className="text-sm text-muted">Mengunggah gambar…</p>}
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

      <Dialog
        open={pendingImage !== null}
        onClose={() => setPendingImage(null)}
        title="Sisipkan gambar"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingImage(null)}>
              Batal
            </Button>
            <Button onClick={insertImage}>Sisipkan</Button>
          </>
        }
      >
        {pendingImage && (
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview of a just-uploaded variant on our media host; next/image adds nothing here */}
            <img src={pendingImage.src} alt="" className="max-h-64 w-full rounded-md border border-border bg-surface-muted object-contain" />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-alt`} className="text-sm font-medium text-text">
                Teks alternatif
              </label>
              <input
                id={`${id}-alt`}
                value={pendingImage.alt}
                onChange={(e) => setPendingImage({ ...pendingImage, alt: e.target.value })}
                onKeyDown={onEnter(insertImage)}
                placeholder="Contoh: Penonton di depan panggung utama"
                className={FIELD}
              />
              <p className="text-sm text-muted">Dibacakan pembaca layar. Kosongkan bila gambar hanya hiasan.</p>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={linkDraft !== null}
        onClose={() => setLinkDraft(null)}
        title={linkDraft?.existing ? "Ubah tautan" : "Tambah tautan"}
        footer={
          <>
            {linkDraft?.existing && (
              <Button variant="ghostDanger" onClick={removeLink} className="mr-auto">
                Hapus tautan
              </Button>
            )}
            <Button variant="secondary" onClick={() => setLinkDraft(null)}>
              Batal
            </Button>
            <Button onClick={saveLink}>Simpan</Button>
          </>
        }
      >
        {linkDraft && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-href`} className="text-sm font-medium text-text">
              Alamat tautan
            </label>
            <input
              id={`${id}-href`}
              type="url"
              inputMode="url"
              value={linkDraft.href}
              onChange={(e) => setLinkDraft({ ...linkDraft, href: e.target.value })}
              onKeyDown={onEnter(saveLink)}
              className={FIELD}
            />
            <p className="text-sm text-muted">Pilih teks di editor dulu, lalu tambahkan tautannya. Tautan terbuka di tab baru.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
