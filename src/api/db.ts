import { MongoClient, type Db } from "mongodb";

export async function connect(uri: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(dbName) };
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("slot_locks").createIndex({ spaceId: 1, date: 1, slot: 1 }, { unique: true });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("bookings").createIndex({ date: 1 });
  await db.collection("bookings").createIndex({ userId: 1, date: 1 });
}
