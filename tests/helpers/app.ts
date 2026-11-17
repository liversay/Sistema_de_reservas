import { createApp } from "../../src/api/app";
import { DEFAULT_NOW, makeTestDb } from "./testDb";

export async function makeTestApp() {
  const t = await makeTestDb();
  const clock = { now: DEFAULT_NOW };
  const app = createApp({ db: t.db, client: t.client, now: () => clock.now, secret: "test-secret" });

  const call = async (method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.cookie) headers.cookie = opts.cookie;
    const res = await app.request(path, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, res, json: text ? JSON.parse(text) : undefined };
  };
  const cookieOf = (res: Response) => {
    const m = /sid=[^;]+/.exec(res.headers.get("set-cookie") ?? "");
    return m ? m[0] : "";
  };
  const register = async (email: string, name = "Cliente Uno") => {
    const r = await call("POST", "/api/auth/register", { body: { name, email, phone: "+591 70000000", password: "secreto123" } });
    return { ...r, cookie: cookieOf(r.res) };
  };
  const loginAdmin = async () => {
    const r = await call("POST", "/api/auth/login", { body: { email: "admin@canchas.local", password: "admin12345" } });
    return cookieOf(r.res);
  };
  return { ...t, app, clock, call, cookieOf, register, loginAdmin };
}
