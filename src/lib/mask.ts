/** `3201********0001` (PRD §14); values too short to keep both ends keep only the last two characters. */
export function maskIdentity(value: string): string {
  if (value.length >= 9) return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
  return `${"*".repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
