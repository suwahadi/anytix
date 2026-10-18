import { describe, expect, it, vi } from "vitest";
import { openCamera, ScanGate } from "@/lib/checkin/scan-gate";

describe("ScanGate", () => {
  it("same QR held in front of the camera is ignored after a slow response", () => {
    const gate = new ScanGate(2000);
    expect(gate.accept("A", 0)).toBe(true);
    expect(gate.accept("A", 100)).toBe(false);
    gate.resume(2500);
    expect(gate.accept("A", 2600)).toBe(false);
    expect(gate.accept("A", 4600)).toBe(true);
  });

  it("another code is accepted as soon as scanning resumes", () => {
    const gate = new ScanGate(2000);
    gate.accept("A", 0);
    expect(gate.accept("B", 10)).toBe(false);
    gate.resume(1600);
    expect(gate.accept("B", 1700)).toBe(true);
  });

  it("forget lets a typed code repeat at once", () => {
    const gate = new ScanGate(2000);
    gate.accept("A", 0);
    gate.resume(10);
    gate.forget();
    expect(gate.accept("A", 20)).toBe(true);
  });
});

describe("openCamera", () => {
  function fakeStream() {
    const stop = vi.fn();
    return { stream: { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream, stop };
  }

  it("stops a stream that arrives after the scanner closed", async () => {
    const { stream, stop } = fakeStream();
    expect(await openCamera(async () => stream, () => true)).toBeNull();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("keeps the stream while the scanner is open", async () => {
    const { stream, stop } = fakeStream();
    expect(await openCamera(async () => stream, () => false)).toBe(stream);
    expect(stop).not.toHaveBeenCalled();
  });
});
