import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Optimistic check only (no DB): bounce visitors without a valid cookie to /login. */
export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  const userId = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.redirect(new URL("/login", req.nextUrl));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|invoices/).*)"],
};
