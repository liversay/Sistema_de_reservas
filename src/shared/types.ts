export type Sport = "futbol" | "padel" | "basquet";
export type Duration = 60 | 90 | 120;
export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "yappy";

export interface ScheduleDay {
  weekday: number; // 0 = lunes … 6 = domingo
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

export interface Court {
  _id: string;
  name: string;
  sport: Sport;
  format?: "5vs5" | "7vs7";
  spaceIds: string[];
  active: boolean;
  prices: Record<"60" | "90" | "120", number>;
  schedule: ScheduleDay[];
}

export interface Booking {
  _id: string;
  courtId: string;
  userId?: string;
  guest?: { name: string; phone: string };
  createdBy: "client" | "admin";
  date: string;
  startSlot: number;
  durationMin: Duration;
  spaceIds: string[];
  price: number;
  status: "confirmada" | "cancelada" | "no_show";
  payment: {
    status: "pendiente" | "pagado";
    amount?: number;
    method?: PaymentMethod;
    paidAt?: string;
    paidBy?: string;
  };
  createdAt: string;
  /** CR-01: agrupa las ocurrencias de una serie semanal. */
  seriesId?: string;
  /** CR-02: precio de lista y % de socio vigente al reservar; `price` ya incluye el descuento. Ausentes en reservas previas. */
  basePrice?: number;
  discountPct?: number;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: "client" | "admin";
}
