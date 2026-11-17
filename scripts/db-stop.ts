import { MongoClient } from "mongodb";

const client = new MongoClient("mongodb://127.0.0.1:27027/?directConnection=true", { serverSelectionTimeoutMS: 2000 });
try {
  await client.connect();
  await client.db("admin").command({ shutdown: 1, force: true });
} catch {
  // shutdown cierra la conexión; si no estaba corriendo, nada que hacer
} finally {
  await client.close().catch(() => {});
}
console.log("MongoDB detenido");
