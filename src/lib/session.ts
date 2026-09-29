import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function getSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;
  const id = crypto.randomUUID();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return id;
}
