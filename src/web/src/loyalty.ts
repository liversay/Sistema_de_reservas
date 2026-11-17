import { useEffect, useState } from "react";
import { api } from "./api";

export { discounted } from "./shared";

/** CR-02 / RN-16: % de descuento de socios (`GET /api/settings/loyalty`); null mientras carga o si falla. */
export function useLoyaltyPct(): number | null {
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .loyalty()
      .then((r) => alive && setPct(r.discountPct))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return pct;
}
