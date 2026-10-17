import QRCode from "qrcode";

const OPTIONS = { margin: 2, errorCorrectionLevel: "M" } as const;

export async function qrSvgDataUrl(token: string): Promise<string> {
  const svg = await QRCode.toString(token, { ...OPTIONS, type: "svg" });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export async function qrPng(token: string): Promise<Uint8Array> {
  return new Uint8Array(await QRCode.toBuffer(token, { ...OPTIONS, width: 600 }));
}
