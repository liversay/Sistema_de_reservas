# Modelo de datos

Base de datos MongoDB (replica set `rs0`, puerto 27027). Bloque = índice de 30 min desde 00:00
(`"20:00"` → 40). Fechas `YYYY-MM-DD`.

## Colecciones

### `spaces`
`{ _id: "futbol-media-a" | "futbol-media-b" | "padel-1" | "basquet-1" | …, name }`

### `courts`
`{ _id, name, sport: "futbol"|"padel"|"basquet", format?: "5vs5"|"7vs7", spaceIds: string[] (≥1), active: boolean, prices: { "60": n, "90": n, "120": n }, schedule: [{ weekday: 0..6 (0 = lunes), open: "HH:MM", close: "HH:MM", closed: boolean }] }`

Sembrado: Media A (`[futbol-media-a]`), Media B (`[futbol-media-b]`), Completa (ambas),
Pádel 1, Básquet 1; precios y horario por defecto según `business-rules.md`.

### `bookings`
`{ _id, courtId, userId? | guest: { name, phone }, createdBy: "client"|"admin", date, startSlot, durationMin: 60|90|120, spaceIds: string[], price, status: "confirmada"|"cancelada"|"no_show", payment: { status: "pendiente"|"pagado", amount?, method?: "efectivo"|"transferencia"|"tarjeta"|"yappy", paidAt?, paidBy? }, createdAt, seriesId?, basePrice?, discountPct? }`

- `spaceIds` y `price` se copian de la cancha al crear (RN-10). *(CR-02: `price` pasa a ser el precio ya con descuento; ver abajo.)*
- "Jugada" no se guarda: se deriva con `hasEnded(date, startSlot, durationMin, now)`.
- **CR-01:** `seriesId?` (string UUID) agrupa las ocurrencias de una serie semanal; las reservas sueltas no lo tienen. Cada ocurrencia sigue siendo una reserva completa, con sus propios `slot_locks`, precio y pago. Antes del ciclo 3 no existía ningún campo de series (decisión de proceso del diseño); el campo es opcional, así que las reservas existentes no requieren migración.
- **CR-02:** `basePrice?` (precio de lista copiado de la cancha, RN-10) y `discountPct?` (entero 0–50 vigente al reservar, RN-16); `price = round2(basePrice·(1−discountPct/100))`. Sin sesión (`guest`) `discountPct = 0`. Las reservas anteriores a CR-02 no tienen estos campos: al leerlas se interpreta `basePrice = price` y `discountPct = 0`, así que no hay migración. `method` admite `yappy`. Una reserva de invitado hecha desde la web (sin cuenta) lleva `guest` y `createdBy: "client"` (a diferencia de la del admin, `createdBy: "admin"`).

### `settings` *(CR-02)*
`{ _id: "loyalty", discountPct: 0..50 (entero) }`. Documento único de configuración del club de socios; se siembra con `discountPct: 10` (*provisional*) si no existe. Lo lee `GET /api/settings/loyalty` (público) y lo escribe `PUT /api/admin/settings/loyalty`. Cada reserva copia el valor vigente (RN-10, RN-16).

### `slot_locks`
`{ spaceId, date, slot, bookingId }` con **índice único `(spaceId, date, slot)`** (RN-01, RN-02).

### `users`
`{ _id, name, email (único), phone, passwordHash, role: "client"|"admin" }`

## Operaciones transaccionales

- **Crear reserva:** en una transacción inserta la reserva y un `slot_lock` por cada bloque × espacio.
  Un `E11000` aborta la transacción y se traduce en `409`.
- **Crear reserva (CR-02):** además lee `settings/loyalty` para calcular `basePrice`, `discountPct` y `price` (solo con sesión de cliente) y valida el horizonte RN-14; la garantía anti-choque no cambia.
- **Crear serie (CR-01):** una sola transacción inserta todas las ocurrencias (reserva + `slot_locks`) con el mismo `seriesId`; si cualquier insert da `E11000` o una ocurrencia incumple una regla, aborta y no queda ninguna (RN-12). El error nombra la fecha de la ocurrencia que falla.
- **Cancelar las próximas (CR-01):** en una transacción marca `cancelada` las ocurrencias `confirmadas` de la serie que no han empezado y borra sus `slot_locks`.
- **Cancelar:** en una transacción marca `cancelada` y borra sus `slot_locks`.
- **No se presentó:** marca `no_show`; conserva los locks (el turno ya pasó).

## Índices

| Colección | Índice | Motivo |
|---|---|---|
| `slot_locks` | único `(spaceId, date, slot)` | RN-01, RN-02 |
| `users` | único `email` | CA-08 |
| `bookings` | `(date)`, `(userId, date)` | Reservas del día y Mis reservas |
| `bookings` | `(seriesId)` *(CR-01)* | Cancelar las próximas de una serie (RF-16) |
| `bookings` | `(date)` *(CR-02, ya existente)* | `GET /api/admin/bookings/calendar` y `payments/summary` agrupan por rango de fechas; no se añaden índices nuevos |
