import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isProtectedPath(pathname: string) {
  if (
    pathname === "/zertifikat/pruefen" ||
    pathname.startsWith("/zertifikat/pruefen/")
  )
    return false;
  return ["/dashboard", "/schulung", "/zertifikat", "/profil", "/admin"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isLegacyCoursePath(pathname: string) {
  return (
    pathname === "/kurs" ||
    pathname === "/quiz" ||
    pathname.startsWith("/quiz/")
  );
}

function legacyCourseRedirect(request: NextRequest, authenticated: boolean) {
  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = authenticated ? "/schulung" : "/login";
  if (!authenticated) destination.searchParams.set("next", "/schulung");
  return NextResponse.redirect(destination, 301);
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isLegacyCoursePath(request.nextUrl.pathname)) {
      return legacyCourseRedirect(request, false);
    }
    if (isProtectedPath(request.nextUrl.pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);
  if (isLegacyCoursePath(request.nextUrl.pathname)) {
    return legacyCourseRedirect(request, authenticated);
  }
  if (isProtectedPath(request.nextUrl.pathname) && !authenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/schulung/:path*",
    "/zertifikat/:path*",
    "/profil/:path*",
    "/admin/:path*",
    "/checkout",
    "/login",
    "/passwort-vergessen",
    "/passwort-zuruecksetzen",
    "/kurs",
    "/quiz/:path*",
  ],
};
