import { z } from "zod";
import { daysBetween, isRealDate } from "./time";

const date = z.string().refine(isRealDate, "Fecha inválida (YYYY-MM-DD)");
const time = z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, "Hora inválida (HH:MM en bloques de 30 min)");
const duration = z.union([z.literal(60), z.literal(90), z.literal(120)]);
const phone = z.string().regex(/^\+?[0-9 ]{7,15}$/, "Teléfono inválido");

export const RegisterInput = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  phone,
  password: z.string().min(8),
});

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const BookingInput = z.object({
  courtId: z.string().min(1),
  date,
  startTime: time,
  durationMin: duration,
});

export const GuestBookingInput = BookingInput.extend({
  guest: z.object({ name: z.string().min(2).max(60), phone }),
});

/** CR-01: serie semanal; `date` es la 1.ª ocurrencia. */
export const SeriesInput = BookingInput.extend({
  weeks: z.number().int().min(2, "Mínimo 2 semanas").max(8, "Máximo 8 semanas"),
});

export const GuestSeriesInput = SeriesInput.extend({
  guest: z.object({ name: z.string().min(2).max(60), phone }),
});

export type SeriesInput = z.infer<typeof SeriesInput>;

export const PaymentInput = z.object({
  amount: z.number().positive(),
  method: z.enum(["efectivo", "transferencia", "tarjeta", "yappy"]),
});

const ScheduleDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  open: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  close: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  closed: z.boolean(),
});

export const CourtInput = z.object({
  name: z.string().min(1),
  sport: z.enum(["futbol", "padel", "basquet"]),
  format: z.enum(["5vs5", "7vs7"]).optional(),
  spaceIds: z.array(z.string()).min(1),
  active: z.boolean(),
  prices: z.object({
    "60": z.number().nonnegative(),
    "90": z.number().nonnegative(),
    "120": z.number().nonnegative(),
  }),
  schedule: z.array(ScheduleDaySchema),
});

/** CR-02 / RN-16: % de descuento de socio. */
export const LoyaltyInput = z.object({
  discountPct: z.number().int("Debe ser entero").min(0, "Mínimo 0").max(50, "Máximo 50"),
});
export const DEFAULT_LOYALTY_PCT = 10;

/** CR-02: rango from/to (YYYY-MM-DD) de calendar y summary; from ≤ to y a lo sumo 62 días entre ambos. */
export const DateRangeQuery = z
  .object({ from: date, to: date })
  .superRefine((r, ctx) => {
    if (!isRealDate(r.from) || !isRealDate(r.to)) return;
    if (r.from > r.to) ctx.addIssue({ code: "custom", path: ["from"], message: "from debe ser anterior o igual a to" });
    else if (daysBetween(r.from, r.to) > 62) ctx.addIssue({ code: "custom", path: ["to"], message: "El rango máximo es de 62 días" });
  });
