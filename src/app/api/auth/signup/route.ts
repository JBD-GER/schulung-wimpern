import { noStoreHeaders } from "@/lib/server/http";

export async function POST() {
  return Response.json(
    {
      ok: false,
      error: "signup_disabled",
      message:
        "Ein Teilnehmerkonto wird ausschließlich nach bestätigter Zahlung im sicheren Checkout erstellt.",
    },
    { status: 410, headers: noStoreHeaders() },
  );
}
