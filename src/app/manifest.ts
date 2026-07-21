import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Schulung Wimpernverlängerung",
    short_name: "SWV Schulung",
    description:
      "Geschützte Online-Lernplattform für professionelle 1:1-Wimpernverlängerung.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FBF9F6",
    theme_color: "#1D2733",
    lang: "de",
    icons: [
      {
        src: "/brand/app-icon-selected-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-selected-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
