/** Engine functions raise SQLSTATE P0001 with a message like `SOLD_OUT:12:3`. */
export function parseEngineError(e: unknown): { code: string; args: string[] } | null {
  if (typeof e !== "object" || e === null) return null;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (code !== "P0001" || typeof message !== "string") return null;
  const [name, ...args] = message.split(":");
  return { code: name, args };
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";
}

export function isCheckViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23514";
}
