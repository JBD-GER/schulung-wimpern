import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.schulung-wimpernverlaengerung.de"
  ).replace(/\/+$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/fragen",
        "/kontakt",
        "/impressum",
        "/datenschutz",
        "/agb",
        "/widerruf",
        "/zertifikat/pruefen",
      ],
      disallow: [
        "/api/",
        "/admin/",
        "/checkout",
        "/dashboard",
        "/login",
        "/passwort-",
        "/profil",
        "/schulung",
        "/zahlung-erfolgreich",
        "/zertifikat",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
