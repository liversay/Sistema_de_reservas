// Servidor para las pruebas e2e: borra la BD `canchas_e2e` (siempre se parte de cero; la API la
// siembra al arrancar) y levanta la API (3000) y Vite (5173) apuntando a ella.
import { MongoClient } from "mongodb";

const root = new URL("..", import.meta.url).pathname;
const url = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0";
const dbName = "canchas_e2e";

const client = new MongoClient(url);
await client.connect();
await client.db(dbName).dropDatabase();
await client.close();

const env = { ...process.env, MONGO_URL: url, MONGO_DB: dbName, ADMIN_PASSWORD: "admin12345" };
const procs = [
  Bun.spawn(["bun", "src/api/server.ts"], { cwd: root, env, stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "run", "dev"], { cwd: `${root}src/web`, env, stdout: "inherit", stderr: "inherit" }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(procs.map((p) => p.exited));
stop();
