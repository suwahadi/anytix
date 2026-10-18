/** Debounces camera reads: one request at a time, and the same code is ignored for `sameMs` after scanning resumes. */
export class ScanGate {
  private busy = false;
  private last = { code: "", at: Number.NEGATIVE_INFINITY };

  constructor(private readonly sameMs: number) {}

  accept(code: string, now: number): boolean {
    if (!code || this.busy || (code === this.last.code && now - this.last.at < this.sameMs)) return false;
    this.busy = true;
    this.last = { code, at: now };
    return true;
  }

  resume(now: number): void {
    this.busy = false;
    this.last.at = now;
  }

  forget(): void {
    this.last = { code: "", at: Number.NEGATIVE_INFINITY };
  }
}

/** Opens the camera; a stream that resolves after the scanner closed is stopped at once so the camera light goes off. */
export async function openCamera(request: () => Promise<MediaStream>, isStopped: () => boolean): Promise<MediaStream | null> {
  const stream = await request();
  if (!isStopped()) return stream;
  stream.getTracks().forEach((t) => t.stop());
  return null;
}
