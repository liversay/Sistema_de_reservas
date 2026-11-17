import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTestApp } from "../helpers/app";

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.drop();
});

describe("auth", () => {
  test("registro válido 201 con cookie y sin passwordHash", async () => {
    const r = await t.call("POST", "/api/auth/register", { body: { name: "Ana Pérez", email: "ana@x.com", phone: "+591 70000000", password: "secreto123" } });
    expect(r.status).toBe(201);
    expect(r.json.role).toBe("client");
    expect(r.json.passwordHash).toBeUndefined();
    const setCookie = r.res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sid=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  test("email repetido 409", async () => {
    const r = await t.call("POST", "/api/auth/register", { body: { name: "Ana Pérez", email: "ana@x.com", phone: "+591 70000000", password: "secreto123" } });
    expect(r.status).toBe(409);
  });

  test("datos inválidos 400 con el campo", async () => {
    const r = await t.call("POST", "/api/auth/register", { body: { name: "A", email: "no-email", phone: "1", password: "123" } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.fields).sort()).toEqual(["email", "name", "password", "phone"]);
  });

  test("cuerpo no JSON 400", async () => {
    const res = await t.app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(res.status).toBe(400);
  });

  test("login erróneo 401 con el mismo mensaje y sin cookie", async () => {
    const a = await t.call("POST", "/api/auth/login", { body: { email: "ana@x.com", password: "incorrecta1" } });
    const b = await t.call("POST", "/api/auth/login", { body: { email: "nadie@x.com", password: "incorrecta1" } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error).toBe(b.json.error);
    expect(a.res.headers.get("set-cookie")).toBeNull();
  });

  test("login correcto, me y logout", async () => {
    const l = await t.call("POST", "/api/auth/login", { body: { email: "ana@x.com", password: "secreto123" } });
    expect(l.status).toBe(200);
    const cookie = t.cookieOf(l.res);
    const me = await t.call("GET", "/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.json.email).toBe("ana@x.com");
    expect(me.json.passwordHash).toBeUndefined();
    const out = await t.call("POST", "/api/auth/logout", { cookie });
    expect(out.status).toBe(204);
    const out2 = await t.call("POST", "/api/auth/logout");
    expect(out2.status).toBe(204);
  });

  test("me sin sesión, con firma inválida o usuario borrado 401", async () => {
    expect((await t.call("GET", "/api/auth/me")).status).toBe(401);
    expect((await t.call("GET", "/api/auth/me", { cookie: "sid=falsa.firma" })).status).toBe(401);
    const r = await t.register("temp@x.com");
    await t.db.collection("users").deleteOne({ email: "temp@x.com" });
    expect((await t.call("GET", "/api/auth/me", { cookie: r.cookie })).status).toBe(401);
  });

  test("/api/bookings sin sesión 401; cliente en /api/admin 403; sin sesión en admin 401", async () => {
    expect((await t.call("POST", "/api/bookings", { body: {} })).status).toBe(401);
    expect((await t.call("GET", "/api/bookings/mine")).status).toBe(401);
    const c = await t.register("cli@x.com");
    expect((await t.call("GET", "/api/admin/courts", { cookie: c.cookie })).status).toBe(403);
    expect((await t.call("GET", "/api/admin/courts")).status).toBe(401);
  });

  test("availability pública: 200 y 400 sin fecha", async () => {
    const ok = await t.call("GET", "/api/availability?date=2026-11-20");
    expect(ok.status).toBe(200);
    expect(ok.json).toHaveLength(5);
    expect((await t.call("GET", "/api/availability")).status).toBe(400);
    expect((await t.call("GET", "/api/availability?date=2026-13-40")).status).toBe(400);
  });
});
