import { ImageResponse } from "next/og";

export const alt =
  "Online Schulung Wimpernverlängerung – professionelle 1:1-Technik";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FBF9F6",
        color: "#1D2733",
        padding: 72,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          border: "2px solid #B08D57",
          borderRadius: 30,
          padding: 56,
          background: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="31" fill="#1D2733" />
            <circle
              cx="32"
              cy="32"
              r="29.4"
              fill="none"
              stroke="#D7A24B"
              strokeWidth="1.45"
            />
            <path
              d="M7.6 41.8C12.8 34.2 18.7 34.6 25.2 36.8C33.5 39.6 39 40.9 45.1 38.6C51.1 36.2 54.8 29.8 56.2 20.6C56.4 29.7 53 36.4 46 40C39.7 43.3 32.1 42.3 23.8 39.5C16.4 37 12 36.5 7.6 41.8Z"
              fill="#D7A24B"
            />
            <path
              d="M44.7 39.2C50.4 35.8 54.9 30.8 58.2 25.5C56.5 32 52.4 37.3 46.7 40.2Z"
              fill="#D7A24B"
            />
            <path
              d="M46.1 39.7C52.6 39.2 57.4 36.3 60.6 31.1C58.2 36.7 53.5 40.2 47.1 40.8Z"
              fill="#D7A24B"
            />
          </svg>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
            SCHULUNG WIMPERNVERLÄNGERUNG
          </div>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", maxWidth: 920 }}
        >
          <div
            style={{
              fontSize: 20,
              color: "#B08D57",
              fontWeight: 700,
              letterSpacing: 3,
            }}
          >
            100 % ONLINE · 7 LEKTIONEN
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 64,
              lineHeight: 1.08,
              fontFamily: "serif",
              fontWeight: 700,
            }}
          >
            Professionelle 1:1-Wimpernverlängerung lernen
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 26,
              color: "#667085",
            }}
          >
            Mit Wissenstests und persönlichem Abschlusszertifikat
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
