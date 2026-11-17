// Solo lo que la web necesita de @canchas/shared, importado por archivo para no arrastrar zod
// (los esquemas) al bundle del navegador.
export { discounted, priceFor } from "@canchas/shared/pricing";
export { DURATIONS, fromSlot, toSlot } from "@canchas/shared/time";
export type { Duration, Sport } from "@canchas/shared/types";
