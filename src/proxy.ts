import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_PATHS = ["/login", "/reset-password"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Never intercept API routes
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return NextResponse.next();
  }

  // Strip locale prefix to determine if the path is public
  const pathnameWithoutLocale = pathname.replace(/^\/(fr|en|th|pt)/, "") || "/";
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathnameWithoutLocale === p || pathnameWithoutLocale.startsWith(p + "/")
  );

  const response = intlMiddleware(request);

  if (isPublic) return response;

  // Build a Supabase server client that reads cookies from the request
  // and writes refreshed tokens back to the response.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() validates the JWT and refreshes it if needed.
  // If the refresh token is invalid, it returns user = null.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    const locale = pathname.split("/")[1] || "fr";
    const loginUrl = new URL(`/${locale}/login`, request.url);

    // Build a redirect that also clears stale auth cookies so the
    // browser doesn't keep trying to refresh an invalid token.
    const redirectResponse = NextResponse.redirect(loginUrl);
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith("sb-")) {
        redirectResponse.cookies.delete(name);
      }
    });

    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
