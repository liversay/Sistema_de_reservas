import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { seed } from "../../src/api/seed";
import { makeTestDb } from "../helpers/testDb";

let t: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  t = await makeTestDb();
});
afterAll(async () => {
  await t.drop();
});

describe("seed", () => {
  test("producción sin ADMIN_PASSWORD -> error", async () => {
    const env = { n: process.env.NODE_ENV, p: process.env.ADMIN_PASSWORD };
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_PASSWORD;
    try {
      await expect(seed(t.db)).rejects.toThrow("ADMIN_PASSWORD es obligatorio en producción");
      await expect(seed(t.db, { adminEmail: "x@y.z", adminPassword: "secreta123" })).resolves.toBeUndefined();
    } finally {
      process.env.NODE_ENV = env.n;
      if (env.p !== undefined) process.env.ADMIN_PASSWORD = env.p;
    }
  });

  test("idempotente: un solo admin y 5 canchas", async () => {
    await seed(t.db);
    await seed(t.db);
    expect(await t.db.collection("users").countDocuments({ email: "admin@canchas.local" })).toBe(1);
    expect(await t.db.collection("courts").countDocuments()).toBe(5);
  });
});
