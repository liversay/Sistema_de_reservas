import { createApp } from "./app";
import { connect, ensureIndexes } from "./db";
import { seed } from "./seed";

const secret = process.env.SESSION_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "dev-secret-no-usar-en-produccion");
if (!secret) throw new Error("SESSION_SECRET es obligatorio en producción");

const { client, db } = await connect(
  process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0",
  process.env.MONGO_DB ?? "canchas",
);
await ensureIndexes(db);
await seed(db);

const app = createApp({ db, client, secret });
const server = Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: app.fetch });
console.log(`API escuchando en http://localhost:${server.port}`);
