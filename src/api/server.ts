import { createApp } from "./app";
import { connect, ensureIndexes } from "./db";
import { seed } from "./seed";

let secret = process.env.SESSION_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET es obligatorio en producción");
  secret = crypto.randomUUID() + crypto.randomUUID();
  console.warn("SESSION_SECRET no definido: secreto aleatorio, las sesiones se reinician al reiniciar el servidor.");
}

const { client, db } = await connect(
  process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0",
  process.env.MONGO_DB ?? "canchas",
);
await ensureIndexes(db);
await seed(db);

const app = createApp({ db, client, secret });
const server = Bun.serve({ port: Number(process.env.PORT ?? 3000), fetch: app.fetch });
console.log(`API escuchando en http://localhost:${server.port}`);
