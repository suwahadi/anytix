import type { NextConfig } from "next";

const MIDTRANS = "https://app.midtrans.com https://app.sandbox.midtrans.com https://api.midtrans.com https://api.sandbox.midtrans.com";
const TURNSTILE = "https://challenges.cloudflare.com";
/** Cloudflare Web Analytics: the proxy injects the beacon script, which reports back to cloudflareinsights.com. */
const CF_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
const CF_ANALYTICS_REPORT = "https://cloudflareinsights.com";

function mediaOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

// shortcut: inline scripts are allowed because Next.js inlines its bootstrap without a nonce; move to a nonce-based CSP when a security audit asks for it.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${MIDTRANS} ${TURNSTILE} ${CF_ANALYTICS_SCRIPT}`,
  `frame-src ${MIDTRANS} ${TURNSTILE}`,
  `connect-src 'self' ${MIDTRANS} ${TURNSTILE} ${CF_ANALYTICS_REPORT}`,
  `img-src 'self' data: blob: ${mediaOrigin()} https://images.unsplash.com ${MIDTRANS}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  ...(process.env.APP_URL?.startsWith("https://") ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    // Dev needs eval and websocket HMR, so the policy only applies to production builds.
    if (process.env.NODE_ENV !== "production") return [];
    // Order URLs carry the access UUID, so they must never leak through Referer; later rules win for the same key.
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/orders/:path*", headers: noReferrer },
      { source: "/api/orders/:path*", headers: noReferrer },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  experimental: {
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
