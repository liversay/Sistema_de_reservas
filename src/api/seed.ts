import type { Db } from "mongodb";
import type { Court, ScheduleDay, User } from "@canchas/shared";
import { connect, ensureIndexes } from "./db";

const SPACES = [
  { _id: "futbol-media-a", name: "Fútbol · Media A" },
  { _id: "futbol-media-b", name: "Fútbol · Media B" },
  { _id: "padel-1", name: "Pádel 1" },
  { _id: "basquet-1", name: "Básquet 1" },
];

const defaultSchedule = (): ScheduleDay[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    open: weekday < 5 ? "16:00" : "08:00",
    close: "23:00",
    closed: false,
  }));

const COURTS: Court[] = [
  { _id: "media-a", name: "Fútbol · Media A", sport: "futbol", format: "5vs5", spaceIds: ["futbol-media-a"], active: true, prices: { "60": 50, "90": 75, "120": 95 }, schedule: defaultSchedule() },
  { _id: "media-b", name: "Fútbol · Media B", sport: "futbol", format: "5vs5", spaceIds: ["futbol-media-b"], active: true, prices: { "60": 50, "90": 75, "120": 95 }, schedule: defaultSchedule() },
  { _id: "completa", name: "Fútbol · Completa", sport: "futbol", format: "7vs7", spaceIds: ["futbol-media-a", "futbol-media-b"], active: true, prices: { "60": 95, "90": 140, "120": 180 }, schedule: defaultSchedule() },
  { _id: "padel-1", name: "Pádel 1", sport: "padel", spaceIds: ["padel-1"], active: true, prices: { "60": 20, "90": 30, "120": 40 }, schedule: defaultSchedule() },
  { _id: "basquet-1", name: "Básquet 1", sport: "basquet", spaceIds: ["basquet-1"], active: true, prices: { "60": 30, "90": 45, "120": 60 }, schedule: defaultSchedule() },
];

/** Idempotente: no pisa lo existente (precios/horario editados, admin ya creado). */
export async function seed(db: Db, opts?: { adminEmail?: string; adminPassword?: string }): Promise<void> {
  const adminEmail = opts?.adminEmail ?? "admin@canchas.local";
  const adminPassword = opts?.adminPassword ?? process.env.ADMIN_PASSWORD;
  if (!adminPassword && process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD es obligatorio en producción");
  }
  const password = adminPassword ?? "admin12345";

  for (const s of SPACES) {
    await db.collection<{ _id: string }>("spaces").updateOne({ _id: s._id }, { $setOnInsert: s }, { upsert: true });
  }
  for (const c of COURTS) {
    await db.collection<{ _id: string }>("courts").updateOne({ _id: c._id }, { $setOnInsert: c }, { upsert: true });
  }
  // CR-02 / RN-16: % de socios inicial (provisional); no pisa el valor que el admin haya editado.
  await db
    .collection<{ _id: string; discountPct: number }>("settings")
    .updateOne({ _id: "loyalty" }, { $setOnInsert: { _id: "loyalty", discountPct: 10 } }, { upsert: true });
  const users = db.collection<User>("users");
  if (!(await users.findOne({ email: adminEmail }))) {
    await users.insertOne({
      _id: crypto.randomUUID(),
      name: "Administrador",
      email: adminEmail,
      phone: "+000000000",
      passwordHash: await Bun.password.hash(password),
      role: "admin",
    });
  }
}

if (import.meta.main) {
  const { client, db } = await connect(
    process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0",
    process.env.MONGO_DB ?? "canchas",
  );
  await ensureIndexes(db);
  await seed(db);
  await client.close();
  console.log("Seed listo");
}
