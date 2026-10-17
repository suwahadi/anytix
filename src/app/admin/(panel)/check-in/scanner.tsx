"use client";

import type { BarcodeDetector as Detector } from "barcode-detector/ponyfill";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { CheckInResult } from "@/lib/checkin/checkin-service";
import { requestJson } from "@/lib/client-fetch";

const WASM = "/vendor/zxing_reader-3.1.3.wasm";
const SAME_CODE_MS = 2000;
const RESULT_MS = 1500;
const SCAN_EVERY_MS = 200;

type Shown = CheckInResult | { result: "offline"; message: string };

async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: typeof Detector }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes("qr_code")) return new Native({ formats: ["qr_code"] });
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM : prefix + path) } });
  return new BarcodeDetector({ formats: ["qr_code"] });
}

function feedback(audio: AudioContext | null, ok: boolean) {
  navigator.vibrate?.(ok ? 200 : [100, 80, 100, 80, 100]);
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = ok ? 880 : 220;
  gain.gain.value = 0.2;
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + (ok ? 0.15 : 0.4));
}

function clock(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function ResultScreen({ shown, timezone, onDismiss }: { shown: Shown; timezone: string; onDismiss: () => void }) {
  const ok = shown.result === "valid";
  const tone = ok ? "bg-scan-ok" : shown.result === "offline" ? "bg-stone-800" : "bg-scan-bad";
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 px-6 text-center text-white ${tone}`}
      aria-live="assertive"
    >
      {shown.result === "valid" && (
        <>
          <span className="text-5xl font-extrabold tracking-tight">VALID</span>
          <span className="text-2xl font-bold">{shown.buyerName}</span>
          <span className="text-xl">{shown.category}</span>
          <span className="text-xl font-semibold">
            Tiket {shown.seq} dari {shown.total}
          </span>
          {shown.identity && <span className="font-mono text-lg">{shown.identity}</span>}
        </>
      )}
      {shown.result === "used" && (
        <>
          <span className="text-5xl font-extrabold tracking-tight">SUDAH DIPAKAI</span>
          <span className="text-2xl font-semibold">
            pukul {clock(shown.checkedInAt, timezone)}
            {shown.gate && `, Gate ${shown.gate}`}
          </span>
        </>
      )}
      {shown.result === "wrong_event" && (
        <>
          <span className="text-5xl font-extrabold tracking-tight">TIDAK VALID</span>
          <span className="text-xl">Tiket untuk event {shown.eventTitle}</span>
        </>
      )}
      {shown.result === "invalid" && <span className="text-5xl font-extrabold tracking-tight">TIDAK VALID</span>}
      {shown.result === "offline" && <span className="text-2xl font-bold">{shown.message}</span>}
      <span className="mt-6 text-sm opacity-80">Ketuk untuk lanjut</span>
    </button>
  );
}

export function Scanner({
  eventId,
  eventTitle,
  timezone,
  gate,
  audio,
  onClose,
}: {
  eventId: number;
  eventTitle: string;
  timezone: string;
  gate: string;
  audio: AudioContext | null;
  onClose: () => void;
}) {
  const uid = useId();
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const last = useRef({ code: "", at: 0 });
  const [shown, setShown] = useState<Shown | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [visible, setVisible] = useState(true);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    clearTimeout(dismissTimer.current);
    setShown(null);
    busy.current = false;
  }, []);

  const submit = useCallback(
    async (code: string) => {
      const token = code.trim();
      const now = Date.now();
      if (!token || busy.current || (token === last.current.code && now - last.current.at < SAME_CODE_MS)) return;
      busy.current = true;
      last.current = { code: token, at: now };
      const res = await requestJson<CheckInResult>("/api/admin/check-ins", { body: { token, eventId, gate } });
      const next: Shown = res.ok ? res.data : { result: "offline", message: res.status === 0 ? "Koneksi gagal. Scan ulang." : res.error };
      feedback(audio, next.result === "valid");
      setShown(next);
      dismissTimer.current = setTimeout(dismiss, RESULT_MS);
    },
    [audio, dismiss, eventId, gate],
  );

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => () => clearTimeout(dismissTimer.current), []);

  useEffect(() => {
    if (!visible) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const detector = await createDetector();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      setCameraError("");
      let detecting = false;
      timer = setInterval(async () => {
        const v = video.current;
        if (detecting || busy.current || !v || v.readyState < 2) return;
        detecting = true;
        try {
          const [code] = await detector.detect(v);
          if (code?.rawValue) void submit(code.rawValue);
        } catch {}
        detecting = false;
      }, SCAN_EVERY_MS);
    })().catch((e: unknown) => {
      if (stopped) return;
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setCameraError(
        denied
          ? "Akses kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, lalu buka ulang scanner. Kode manual tetap bisa dipakai."
          : "Kamera tidak tersedia di perangkat ini. Pakai kode manual di bawah.",
      );
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [submit, visible]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/admin/" }).catch(() => {});
  }, []);

  function manualSubmit(e: FormEvent) {
    e.preventDefault();
    last.current = { code: "", at: 0 };
    void submit(manual.replace(/\s+/g, ""));
    setManual("");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{eventTitle}</p>
          <p className="text-sm text-stone-300">Gate {gate}</p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          Selesai
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={video} muted playsInline className="size-full object-cover" aria-label="Kamera scanner" />
        {!cameraError && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-60 rounded-lg border-4 border-white/80" />
          </div>
        )}
        {cameraError && <p className="absolute inset-x-4 top-1/3 rounded-md bg-stone-900 p-4 text-center">{cameraError}</p>}
      </div>
      <form onSubmit={manualSubmit} className="flex items-end gap-2 bg-stone-950 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`${uid}-manual`} className="text-sm text-stone-300">
            Kode manual (teks di bawah QR)
          </label>
          <input
            id={`${uid}-manual`}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={80}
            className="h-11 rounded-md border border-stone-600 bg-stone-900 px-3 font-mono text-base text-white"
          />
        </div>
        <Button type="submit">Cek</Button>
      </form>
      {shown && <ResultScreen shown={shown} timezone={timezone} onDismiss={dismiss} />}
    </div>
  );
}
