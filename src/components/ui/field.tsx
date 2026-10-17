import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text placeholder:text-muted aria-invalid:border-danger disabled:opacity-60";

type Common = { id: string; label: string; hint?: string; error?: string };

function describedBy(id: string, hint?: string, error?: string) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

function Wrapper({ id, label, hint, error, children }: Common & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
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

export function Field({
  id,
  label,
  hint,
  error,
  ref,
  className = "",
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`h-11 ${CONTROL} ${className}`}
      />
    </Wrapper>
  );
}

export function TextArea({
  id,
  label,
  hint,
  error,
  className = "",
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={4}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`py-2 ${CONTROL} ${className}`}
      />
    </Wrapper>
  );
}

export function Select({
  id,
  label,
  hint,
  error,
  options,
  className = "",
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }> }) {
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        {...props}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`h-11 ${CONTROL} ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function Checkbox({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        {...props}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-5 shrink-0 accent-accent"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-text">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
