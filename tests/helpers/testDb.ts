import { connect, ensureIndexes } from "../../src/api/db";
import { seed } from "../../src/api/seed";

export const MONGO_URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0";
export const DEFAULT_NOW = new Date(2026, 10, 19, 10, 0, 0, 0); // jueves 2026-11-19 10:00 local

export async function makeTestDb() {
  const name = `canchas_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { client, db } = await connect(MONGO_URL, name);
  await ensureIndexes(db);
  await seed(db);
  return {
    db,
    client,
    ctx: (now: Date = DEFAULT_NOW) => ({ db, client, now }),
    async drop() {
      await db.dropDatabase();
      await client.close();
    },
  };
}
