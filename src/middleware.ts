import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(SESSION_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) {
    return NextResponse.next();
  }
  const id = crypto.randomUUID();
  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next|fonts|favicon.ico|mcp.json).*)"],
};
