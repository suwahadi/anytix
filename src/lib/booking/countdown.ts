/** Time left measured on the server clock: the device clock only measures how long ago the response arrived. */
export function remainingMs(expiresAt: string, serverNow: string, receivedAt: number, now: number): number {
  return Math.max(0, Date.parse(expiresAt) - Date.parse(serverNow) - (now - receivedAt));
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
