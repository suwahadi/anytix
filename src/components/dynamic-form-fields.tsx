"use client";

import { Checkbox, Field, Select, TextArea } from "@/components/ui/field";
import { IDENTITY_TYPES, type FormFieldDef, type IdentityAnswer } from "@/lib/form-schema";

export type AnswerValues = Record<string, unknown>;

function Choice({
  field,
  name,
  value,
  error,
  onChange,
  chips,
}: {
  field: FormFieldDef;
  name: string;
  value: unknown;
  error?: string;
  onChange: (v: string) => void;
  chips: boolean;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : field.helpText ? `${name}-hint` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-text">
        {field.label}
        {field.required && " *"}
      </legend>
      <div className={chips ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        {field.options.map((o) => (
          <label
            key={o.value}
            className={
              chips
                ? "cursor-pointer rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-text has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                : "flex items-center gap-3 text-sm text-text"
            }
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={chips ? "sr-only" : "size-5 accent-accent"}
            />
            {o.label}
          </label>
        ))}
      </div>
      {field.helpText && (
        <p id={`${name}-hint`} className="mt-1.5 text-sm text-muted">
          {field.helpText}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function DynamicFormFields({
  fields,
  values,
  errors,
  onChange,
  idPrefix = "answer",
}: {
  fields: FormFieldDef[];
  values: AnswerValues;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  idPrefix?: string;
}) {
  return (
    <>
      {fields
        .filter((f) => f.isActive)
        .map((f) => {
          const id = `${idPrefix}-${f.key}`;
          const label = `${f.label}${f.required ? " *" : ""}`;
          const value = values[f.key];
          const common = {
            id,
            label,
            hint: f.helpText ?? undefined,
            error: errors[f.key],
            placeholder: f.placeholder ?? undefined,
            required: f.required,
          };
          switch (f.type) {
            case "short_text":
              return <Field key={f.key} {...common} value={(value as string) ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />;
            case "long_text":
              return <TextArea key={f.key} {...common} value={(value as string) ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />;
            case "number":
              return (
                <Field
                  key={f.key}
                  {...common}
                  type="number"
                  inputMode="decimal"
                  value={(value as string) ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
              );
            case "date":
              return <Field key={f.key} {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />;
            case "select":
              return (
                <Select
                  key={f.key}
                  {...common}
                  value={(value as string) ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  options={[{ value: "", label: f.placeholder || "Pilih…" }, ...f.options]}
                />
              );
            case "radio":
            case "chips":
              return (
                <Choice key={f.key} field={f} name={id} value={value} error={errors[f.key]} chips={f.type === "chips"} onChange={(v) => onChange(f.key, v)} />
              );
            case "checkbox": {
              const selected = (value as string[]) ?? [];
              return (
                <fieldset key={f.key} aria-describedby={errors[f.key] ? `${id}-error` : undefined}>
                  <legend className="mb-1.5 text-sm font-medium text-text">{label}</legend>
                  <div className="flex flex-col gap-2">
                    {f.options.map((o) => (
                      <Checkbox
                        key={o.value}
                        id={`${id}-${o.value}`}
                        label={o.label}
                        checked={selected.includes(o.value)}
                        onChange={(e) =>
                          onChange(f.key, e.target.checked ? [...selected, o.value] : selected.filter((s) => s !== o.value))
                        }
                      />
                    ))}
                  </div>
                  {f.helpText && <p className="mt-1.5 text-sm text-muted">{f.helpText}</p>}
                  {errors[f.key] && (
                    <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
                      {errors[f.key]}
                    </p>
                  )}
                </fieldset>
              );
            }
            case "identity": {
              const answer = (value as IdentityAnswer) ?? { type: "", number: "" };
              const allowed = f.validation?.identityTypes?.length
                ? IDENTITY_TYPES.filter((t) => f.validation.identityTypes!.includes(t.value))
                : IDENTITY_TYPES;
              const isKtp = answer.type === "KTP";
              return (
                <fieldset key={f.key} className="flex flex-col gap-3" aria-describedby={errors[f.key] ? `${id}-error` : undefined}>
                  <legend className="mb-1.5 text-sm font-medium text-text">{label}</legend>
                  <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                    <Select
                      id={`${id}-type`}
                      label="Tipe identitas"
                      value={answer.type}
                      onChange={(e) => onChange(f.key, { ...answer, type: e.target.value })}
                      options={[{ value: "", label: "Pilih…" }, ...allowed.map((t) => ({ value: t.value, label: t.label }))]}
                    />
                    <Field
                      id={`${id}-number`}
                      label="Nomor identitas"
                      inputMode={isKtp ? "numeric" : "text"}
                      maxLength={isKtp ? 16 : 20}
                      autoComplete="off"
                      value={answer.number}
                      onChange={(e) => onChange(f.key, { ...answer, number: isKtp ? e.target.value.replace(/\D/g, "") : e.target.value })}
                    />
                  </div>
                  {f.helpText && <p className="text-sm text-muted">{f.helpText}</p>}
                  {errors[f.key] && (
                    <p id={`${id}-error`} className="text-sm text-danger">
                      {errors[f.key]}
                    </p>
                  )}
                </fieldset>
              );
            }
          }
        })}
    </>
  );
}
