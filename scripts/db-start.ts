import { mkdirSync, existsSync } from "node:fs";
import { MongoClient } from "mongodb";

const PORT = 27027;
const dbpath = ".data/db";
mkdirSync(dbpath, { recursive: true });

async function reachable(): Promise<boolean> {
  const c = new MongoClient(`mongodb://127.0.0.1:${PORT}/?directConnection=true`, { serverSelectionTimeoutMS: 800 });
  try {
    await c.connect();
    await c.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await c.close().catch(() => {});
  }
}

if (!(await reachable())) {
  const p = Bun.spawnSync([
    "mongod", "--replSet", "rs0", "--port", String(PORT), "--dbpath", dbpath,
    "--fork", "--logpath", ".data/mongod.log",
  ]);
  if (p.exitCode !== 0) {
    console.error(p.stdout.toString(), p.stderr.toString());
    process.exit(1);
  }
}

const client = new MongoClient(`mongodb://127.0.0.1:${PORT}/?directConnection=true`, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const admin = client.db("admin");
try {
  await admin.command({ replSetGetStatus: 1 });
} catch (e: any) {
  if (e?.codeName === "NotYetInitialized" || e?.code === 94) {
    await admin.command({
      replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] },
    });
  } else throw e;
}
for (let i = 0; i < 30; i++) {
  const hello = await admin.command({ hello: 1 });
  if (hello.isWritablePrimary) break;
  await Bun.sleep(500);
}
await client.close();
console.log(`MongoDB listo en mongodb://127.0.0.1:${PORT}/?replicaSet=rs0 (db en ${dbpath})`);
