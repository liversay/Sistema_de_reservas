import type { Db } from "mongodb";
import { DEFAULT_LOYALTY_PCT } from "@canchas/shared";

/** CR-02 / RN-16: documento único `settings/loyalty`. */
export async function getLoyaltyPct(db: Db): Promise<number> {
  const doc = await db.collection<{ _id: string; discountPct: number }>("settings").findOne({ _id: "loyalty" });
  return doc?.discountPct ?? DEFAULT_LOYALTY_PCT;
}

export async function setLoyaltyPct(db: Db, discountPct: number): Promise<number> {
  await db
    .collection<{ _id: string; discountPct: number }>("settings")
    .updateOne({ _id: "loyalty" }, { $set: { discountPct } }, { upsert: true });
  return discountPct;
}
