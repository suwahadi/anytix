const FORMULA = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV for Excel: UTF-8 BOM, CRLF, and text cells that a spreadsheet would run as a formula prefixed with `'`. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
