import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireEnv } from "@/lib/env";
import {
  CONSENT_COOKIE,
  CONSENT_ID_COOKIE,
  serializePrivacyConsent,
  type PrivacyConsent,
} from "@/lib/privacy-consent";
import {
  assertSameOrigin,
  jsonError,
  noStoreHeaders,
  readJson,
} from "@/lib/server/http";
import { enforceRateLimit, requestSubject } from "@/lib/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const inputSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  version: z.string().trim().min(3).max(80),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = inputSchema.parse(await readJson(request));
    await enforceRateLimit({
      bucket: "privacy-consent",
      subject: requestSubject(request),
      maximum: 30,
      windowSeconds: 3600,
    });
    const currentVersion = requireEnv("NEXT_PUBLIC_COOKIE_CONSENT_VERSION");
    if (input.version !== currentVersion) {
      return Response.json(
        {
          ok: false,
          error: "consent_version_changed",
          message:
            "Die Datenschutzauswahl wurde aktualisiert. Bitte lade die Seite neu.",
        },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const storedAnonymousId = cookieHeader
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${CONSENT_ID_COOKIE}=`))
      ?.slice(CONSENT_ID_COOKIE.length + 1);
    const anonymousId =
      storedAnonymousId && /^[a-f0-9-]{36}$/i.test(storedAnonymousId)
        ? storedAnonymousId
        : randomUUID();
    const consent: PrivacyConsent = {
      version: currentVersion,
      necessary: true,
      analytics: input.analytics,
      marketing: input.marketing,
      updatedAt: new Date().toISOString(),
    };

    const { error } = await getSupabaseAdmin()
      .from("consent_records")
      .insert([
        {
          anonymous_id: anonymousId,
          consent_type: "website_analytics",
          consent_version: currentVersion,
          granted: consent.analytics,
          proof: {
            source: "cookie_banner",
            necessary: true,
            analytics: consent.analytics,
            marketing: consent.marketing,
          },
        },
        {
          anonymous_id: anonymousId,
          consent_type: "google_ads_conversion",
          consent_version: currentVersion,
          granted: consent.marketing,
          proof: {
            source: "cookie_banner",
            necessary: true,
            analytics: consent.analytics,
            marketing: consent.marketing,
            adPersonalization: false,
          },
        },
      ]);
    if (error) throw error;

    const response = NextResponse.json(
      { ok: true, consent },
      { headers: noStoreHeaders() },
    );
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set(CONSENT_COOKIE, serializePrivacyConsent(consent), {
      httpOnly: false,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 180 * 24 * 60 * 60,
      priority: "medium",
    });
    response.cookies.set(CONSENT_ID_COOKIE, anonymousId, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/api/privacy/consent",
      maxAge: 400 * 24 * 60 * 60,
      priority: "medium",
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
