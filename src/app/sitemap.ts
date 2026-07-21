import type { MetadataRoute } from "next";
import { getReleaseContract } from "@/lib/server/release";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const legalPages = getReleaseContract().legal.approved
    ? ["/impressum", "/datenschutz", "/agb", "/widerruf"]
    : [];
  const pages = [
    "",
    "/fragen",
    "/kontakt",
    "/cookie-einstellungen",
    ...legalPages,
  ];
  return pages.map((path, index) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : path === "/fragen" ? 0.8 : 0.4,
  }));
}
