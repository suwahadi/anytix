# Project Rules

These rules apply to every AI agent working in this project folder (the folder that contains this file, and all its subfolders). They are project rules, not global ones. Follow them on every task, without being reminded.

## Rule 1: No annotation comments in code

Applies to **every file you create or edit**: JS, TS, JSX, TSX, HTML, CSS, and any custom code.

### Remove

- Inline annotation comments, such as `// set the price` or `// loop over items`.
- Tag-style comments, such as `// NOTE:`, `// TODO:`, `// FIX:`, `// added by AI`.
- Decorative divider blocks, including old ones already in a file you edit, such as `// ==========`, `/* ----- Helpers ----- */`, or multi-line banner comments.
- Template comments used purely for annotation, such as JSX/TSX `{/* ... */}` or EJS `<%# ... %>`.

### Keep

- JSDoc / TSDoc blocks: `/** ... */`.
- Comments that explain genuinely non-obvious technical logic: a race condition, a workaround, a non-trivial algorithm or limit.
- One-line section markers that only name a page section, such as `<!-- ABOUT US -->` (in HTML) or `// --- API Routes ---` (in JS/TS).

### Remove safely

- Strip comments only. Never change behavior, logic, output, functions, or features.
- If a `//` comment explains non-obvious logic, keep it (or move it into a `/** ... */` block). Never delete the reasoning.
- Only clean files you are already touching for the task. Do not sweep unrelated files.

### Before you finish

Check every file you touched:

1. No annotation, tag-style, or divider comments are left.
2. Section markers such as `<!-- ABOUT US -->` or `// --- API Routes ---` are still in place.
3. The code behaves exactly as before, apart from the change you were asked to make.
<!-- BEGIN:nextjs-agent-rules -->

## Rule 2: Owner workflow

- Read `docs/superpowers/HANDOFF.md` before continuing work. It has the current status, the next steps and known environment traps.
- Commits and pull requests never include AI attribution: no `Co-Authored-By: Claude`/Anthropic trailer and no "Generated with Claude Code" line.
- Work on `main`. At the end of every phase, commit and push to `origin main` (https://github.com/suwahadi/anytix.git) without asking.
- Explain and report to the owner in Indonesian. Code, comments and commit messages stay in English.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
