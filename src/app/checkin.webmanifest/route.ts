import { getPublicSite } from "@/lib/public/catalog-queries";

/** Linked only from the check-in page, so installing the public site never opens the admin scanner. */
export async function GET() {
  const { name } = await getPublicSite();
  return Response.json(
    {
      name: `${name} Check-in`,
      short_name: "Check-in",
      start_url: "/admin/check-in",
      scope: "/admin/",
      display: "standalone",
      background_color: "#1c1917",
      theme_color: "#C2410C",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
