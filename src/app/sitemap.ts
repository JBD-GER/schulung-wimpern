import type { MetadataRoute } from "next";
import { getReleaseContract } from "@/lib/server/release";

export const dynamic = "force-dynamic";

const DEFAULT_SITE_URL = "https://www.schulung-wimpernverlaengerung.de";

type SitemapPage = {
  path: string;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  priority: number;
};

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl();
  const legalPages: SitemapPage[] = getReleaseContract().legal.approved
    ? [
        { path: "/impressum", changeFrequency: "yearly", priority: 0.2 },
        { path: "/datenschutz", changeFrequency: "yearly", priority: 0.2 },
        { path: "/agb", changeFrequency: "yearly", priority: 0.2 },
        { path: "/widerruf", changeFrequency: "yearly", priority: 0.3 },
      ]
    : [];
  const pages: SitemapPage[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/fragen", changeFrequency: "monthly", priority: 0.8 },
    { path: "/kontakt", changeFrequency: "monthly", priority: 0.6 },
    {
      path: "/cookie-einstellungen",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    ...legalPages,
  ];

  return pages.map(({ path, changeFrequency, priority }) => ({
    url: path === "/" ? baseUrl + "/" : baseUrl + path,
    changeFrequency,
    priority,
  }));
}
