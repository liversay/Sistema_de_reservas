# API HTTP

Base `/api`, JSON (`Content-Type: application/json`). Fechas `YYYY-MM-DD`, horas `HH:MM`. Sesión por
cookie firmada `sid` (httpOnly, `SameSite=Lax`) que contiene el `userId` (ver ADR-004). La app se
construye con `createApp({ db, client, now?, secret })` donde `now?: () => Date` es una función
(por defecto `() => new Date()`) inyectable en las pruebas (RN-05, RN-06, RN-07). Cada ruta llama
`now()` una vez por petición y pasa a los servicios un `now: Date` ya resuelto.

## Convenciones

### Códigos de error

| Código | Uso |
|---|---|
| 400 | Entrada inválida (Zod) |
| 401 | Sin sesión |
| 403 | Sin rol admin |
| 404 | No existe (o no es del usuario, en rutas de cliente) |
| 409 | Choque o estado incompatible |
| 422 | Regla de negocio (horario, pasado, horizonte de 30 días *(CR-02)*, pago/no-show antes de terminar, ya empezó) |

Cuerpo de todo error: `{ "error": string }`; en `400` además `fields?: { [campo]: string }` con el
mensaje de cada campo inválido. Mensaje de choque exacto: `"Ese horario ya fue tomado. Elige otro."` (CR-01: en series, variante con fecha `"Ese horario ya fue tomado el <YYYY-MM-DD>. Elige otro."`)

### Recursos

- **Usuario** (nunca incluye `passwordHash`): `{ id, name, email, phone, role: "client"|"admin" }`.
- **Reserva**: `{ id, courtId, courtName, date, startTime, endTime, durationMin, spaceIds, price, `basePrice`, `discountPct` *(CR-02: `price` ya incluye el descuento; reservas previas devuelven `basePrice = price` y `discountPct = 0`)*, status: "confirmada"|"cancelada"|"no_show", payment: { status: "pendiente"|"pagado", amount?, method?: "efectivo"|"transferencia"|"tarjeta"|"yappy", paidAt?, paidBy? }, createdBy: "client"|"admin", user?: { name, phone }, guest?: { name, phone }, createdAt }`.
  `startTime`/`endTime` se derivan de `startSlot` y `durationMin`. Exactamente uno de `user` (reserva con sesión de cliente) o `guest` (reserva de invitado: del admin o, desde CR-02, de un visitante sin cuenta). En **todas** las respuestas de admin que listan o devuelven reservas (`GET /api/admin/bookings`, `GET /api/admin/payments` y las mutaciones) se añade `played: boolean` (derivado con `hasEnded` y `now`).
- **Cancha**: `{ id, name, sport, format?, spaceIds, active, prices: { "60", "90", "120" }, schedule: [{ weekday: 0..6, open, close, closed }] }`. En el cuerpo de `POST`/`PUT`: `prices` con las tres claves `"60"`, `"90"`, `"120"` y números positivos; cada item de `schedule` con `weekday` entero 0–6, `open` y `close` `"HH:MM"` y `closed` booleano; `open < close` solo se exige cuando `closed = false` (si no, `400`); dos items con el mismo `weekday` → `400`.
- **Ids sembrados de cancha:** `media-a`, `media-b`, `completa`, `padel-1`, `basquet-1`.
- **Orden de validación en rutas que crean reservas:** sesión/rol (401/403; *CR-02: `POST /api/bookings` y `/series` ya no devuelven `401`, ver abajo*) → cuerpo Zod (400) → cancha existe (404) → regla de negocio (422: inactiva, fuera de horario, pasado, *CR-02: horizonte de 30 días*) → choque (409). La capa Zod de la ruta devuelve `400` ante `startTime` o `durationMin` mal formados antes de llegar al servicio (que de otro modo respondería `422`).
- **Orden de validación en pago y no-show:** sesión/rol (401/403) → cuerpo Zod (400, solo pago) → reserva existe (404) → estado (409: no está `confirmada`, o ya pagada) → reloj (422: aún no terminó). Un pago o no-show sobre una reserva cancelada o `no_show` que además no terminó responde `409`, no `422`.

### Reglas de acceso

Rutas de **cliente** y `GET /api/auth/me`: `401` sin sesión. Rutas `/api/admin/*`: `401` sin sesión,
`403` con sesión de rol `client`. Una cookie con firma inválida o de un usuario que ya no existe se
trata como sin sesión (`401`).

## Público

| Método y ruta | Descripción | CA |
|---|---|---|
| `GET /api/availability?date=` | `200` arreglo (sin envoltorio) `[{ courtId, name, sport, format?, prices: { "60", "90", "120" }, slots: [{ slot, time: "HH:MM", state }] }]`, una entrada por cancha activa; `slot` es el índice de bloque de 30 min y `prices` permite mostrar el precio (CA-03). `state` es exactamente uno de `libre` \| `ocupado` \| `cerrado` \| `pasado`; `cerrado` = fuera del horario de atención ese día; `pasado` = bloque que ya inició (respecto a `now`). `400` si `date` falta o es inválida. | CA-01, CA-02, CA-03 |
| `GET /api/settings/loyalty` *(CR-02)* | `200 { discountPct }` (entero 0–50; 10 por defecto). Sin sesión | CA-20, CA-25 |

## Auth

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `POST /api/auth/register` | `{ name, email, phone, password }` | `201` usuario + `Set-Cookie: sid` (rol `client`); `400` con `fields`; `409` email repetido | CA-08 |
| `POST /api/auth/login` | `{ email, password }` | `200` usuario + `Set-Cookie: sid`; `401` credenciales (mismo mensaje para email desconocido y contraseña errónea, sin crear sesión); `400` cuerpo inválido | CA-09 |
| `POST /api/auth/logout` | — | `204`; borra la cookie (idempotente, también sin sesión) | CA-09 |
| `GET /api/auth/me` | — | `200` usuario; `401` | CA-09 |

## Cliente (CR-02: reservar no requiere sesión; «Mis reservas» y cancelar sí)

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `POST /api/bookings` | `{ courtId, date, startTime, durationMin, guest? }`. *(CR-02)* Sin sesión de cliente `guest: { name, phone }` es obligatorio (RN-15); con sesión de cliente se ignora | `201` reserva (`status: confirmada`, `payment.status: pendiente`, `price` calculado por el servidor; *CR-02:* con sesión incluye descuento de socio `basePrice`/`discountPct`/`price` (RN-16), sin sesión `discountPct = 0` y `guest`); `400` (incluye `guest` ausente o inválido sin sesión, con `fields` `guest.name`/`guest.phone`); `404` cancha; `409` choque; `422` fuera de horario, pasado, cancha inactiva o más de 30 días (RN-14). *~~`401` sin sesión~~ (modificado por CR-02: ya no se devuelve)* | CA-04, CA-05, CA-06, CA-19, CA-20, CA-21 |
| `GET /api/bookings/mine` | — | `200 [reserva]` solo del usuario, ordenadas por fecha y hora descendente, todos los estados; `401` | CA-04 |
| `POST /api/bookings/:id/cancel` | — | `200` reserva con `status: cancelada` y bloques liberados; `401`; `404` no existe o no es suya; `409` no está `confirmada`; `422` ya empezó | CA-07 |
| `POST /api/bookings/series` *(CR-01; CR-02: `guest?` sin sesión, descuento y horizonte)* | `{ courtId, date, startTime, durationMin, weeks, guest? }` con `weeks` entero 2…8; `date` es la 1.ª ocurrencia; sin sesión de cliente `guest` obligatorio (RN-15) | `201 { seriesId, bookings: [reserva] }` (`weeks` reservas con `seriesId` compartido, fechas `date + 7·k`, precio y pago por ocurrencia); `400` (incluye `weeks` fuera de rango y, sin sesión, `guest` ausente o inválido); *~~`401`~~ (CR-02: ya no se devuelve)*; `404` cancha; `409` "Ese horario ya fue tomado el <YYYY-MM-DD>. Elige otro." con la fecha que choca; `422` horario, pasado, cancha inactiva u horizonte (RN-14: alguna ocurrencia pasa de hoy + 30 días), nombrando la fecha. Todo-o-nada (RN-12): ante un error no se crea ninguna. *CR-02:* con sesión, cada ocurrencia lleva el descuento vigente | CA-15, CA-16, CA-19, CA-20, CA-21 |
| `POST /api/bookings/series/:seriesId/cancel-future` *(CR-01)* | — | `200 { cancelled: n }`: cancela solo las ocurrencias `confirmadas` que no han empezado de una serie propia; `n` puede ser 0; `401`; `404` serie inexistente o ajena | CA-17 |

## Admin (rol admin: `401` sin sesión, `403` sin rol)

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `GET /api/admin/bookings?date=` | — | `200 [reserva]` del día (todos los estados, **incluidas las canceladas**, que el tablero lista aparte porque no ocupan bloques) con `played`, `basePrice`, `discountPct`, y cliente (`user: { name, phone }`) o `guest`; `400` fecha inválida | CA-10, CA-23 |
| `GET /api/admin/bookings/calendar?from=&to=` *(CR-02)* | `from`, `to` `YYYY-MM-DD`, `from ≤ to`, rango ≤ 62 días | `200 [{ date, count }]` con las reservas **no canceladas** por día (solo días con `count > 0`), orden ascendente; `400` fecha inválida, `from > to` o rango > 62 días | CA-23 |
| `POST /api/admin/bookings` | `{ courtId, date, startTime, durationMin, guest: { name, phone } }` | `201` reserva con `createdBy: admin` y `guest`; `400` (falta nombre o teléfono); `404` cancha; `409` choque; `422` horario, pasado o cancha inactiva | CA-11 |
| `POST /api/admin/bookings/series` *(CR-01)* | `{ courtId, date, startTime, durationMin, weeks, guest: { name, phone } }` | `201 { seriesId, bookings }` con `createdBy: admin` y `guest`; `400` (falta nombre o teléfono, `weeks` fuera de 2…8); `404` cancha; `409` con la fecha que choca; `422` con la fecha; todo-o-nada (RN-12) | CA-18 |
| `POST /api/admin/bookings/series/:seriesId/cancel-future` *(CR-01)* | — | `200 { cancelled: n }` sobre cualquier serie, solo ocurrencias `confirmadas` que no han empezado; `404` serie inexistente | CA-17 |
| `POST /api/admin/bookings/:id/payment` | `{ amount, method: "efectivo"\|"transferencia"\|"tarjeta"\|"yappy" }` *(CR-02: `yappy` nuevo)* con `amount > 0` | `200` reserva con `payment: { status: pagado, amount, method, paidAt, paidBy }` (`paidBy` = id del admin de la sesión); `400`; `404`; `409` ya pagada, `cancelada` o `no_show`; `422` aún no terminó (el `409` se evalúa antes que el `422`) | CA-12, CA-13 |
| `POST /api/admin/bookings/:id/no-show` | — | `200` reserva con `status: no_show` (conserva los bloques); `404`; `409` no está `confirmada`; `422` aún no terminó (el `409` se evalúa antes que el `422`) | CA-13 |
| `POST /api/admin/bookings/:id/cancel` | — | `200` reserva `cancelada` y bloques liberados; `404`; `409` no está `confirmada`; sin restricción de hora (RN-06) | CA-10 |
| `GET /api/admin/payments?status=pending\|paid` | — | `200 [reserva]`. `pending` = por cobrar (jugada, `confirmada`, pago `pendiente`); `paid` = cobradas (`payment.status = pagado`); `400` si `status` falta o es otro valor | CA-12, CA-13 |
| `GET /api/admin/payments/summary?from=&to=` *(CR-02)* | `from`, `to` `YYYY-MM-DD`, `from ≤ to`, rango ≤ 62 días | `200 { collected, pending, pendingCount, bookings, cancelled, noShow, byMethod: { efectivo, transferencia, tarjeta, yappy }, byDay: [{ date, collected }], occupancyPct }`. `collected` = suma de `payment.amount` de reservas pagadas con `date` en el rango; `pending` / `pendingCount` = monto y cantidad por cobrar (jugadas `confirmadas` con pago pendiente); `bookings` = reservas no canceladas; `cancelled`, `noShow` = conteos; `byMethod` = monto cobrado por método (las cuatro claves siempre, 0 si no hay); `byDay` = cobrado por día con cobros; `occupancyPct` = bloques reservados / bloques abiertos de canchas activas en el rango × 100 (0 si no hay bloques abiertos). `400` fecha inválida o rango; `401`/`403` | CA-24 |
| `GET /api/admin/settings/loyalty` *(CR-02)* | — | `200 { discountPct }`; `401`/`403` | CA-25 |
| `PUT /api/admin/settings/loyalty` *(CR-02)* | `{ discountPct }` entero 0…50 | `200 { discountPct }`; `400` fuera de rango o no entero; `401`/`403`. No altera reservas existentes (RN-16, RN-10) | CA-25 |
| `GET /api/admin/courts` | — | `200 [cancha]` (incluye inactivas) | CA-14 |
| `GET /api/admin/courts/:id` | — | `200 cancha`; `404` | CA-14 |
| `POST /api/admin/courts` | `{ id, name, sport, format?, spaceIds, active, prices, schedule }`; `id` obligatorio en kebab-case `/^[a-z0-9-]+$/` | `201` cancha; `400` (incluye `id` inválido); `409` si el `id` ya existe | CA-14 |
| `PUT /api/admin/courts/:id` | mismo cuerpo; `id` es opcional y, si viene, debe ser igual a `:id` (el id de la cancha es inmutable) | `200` cancha; `400` (incluye `id` distinto de `:id`); `404`. Reemplazo completo | CA-14 |
| `DELETE /api/admin/courts/:id` | — | `204`; `404`; `409` si la cancha tiene reservas (solo desactivarla) | CA-14 |

Notas de cancha: `spaceIds` ≥ 1. `POST` y `PUT` aceptan `spaceIds` nuevos y los **insertan en
`spaces`** si no existen (upsert), lo que permite crear "Pádel 2" sin tocar la base a mano. Los
cambios no alteran reservas existentes (RN-10).

## Notas

- **CR-02, formato de horas:** la API sigue usando `HH:MM` de 24 h en todos los campos; el formato de 12 h es solo de presentación en la web (`formatTime12("20:00") === "8:00 p. m."`, `"12:00" → "12:00 p. m."`, `"00:30" → "12:30 a. m."`; `formatLongDate("2026-11-12") === "jueves 12 de noviembre de 2026"`).
- **CR-02, horizonte (RN-14) en `ruleViolation`:** se evalúa con el `now` inyectado junto con inactiva, fuera de horario y pasado; fecha > hoy + 30 días → `422` "Solo se puede reservar hasta 30 días de anticipación." (en series, el mensaje nombra la fecha de la primera ocurrencia que excede). Dentro del `422` de series mantiene el orden de RN-12.
- **CR-02, sesión opcional:** `POST /api/bookings` y `/series` leen la sesión si existe; sin sesión (o con sesión de admin) exigen `guest`. Las demás rutas de cliente (`mine`, `cancel`, `cancel-future`) siguen devolviendo `401` sin sesión.

- **CR-01:** cada reserva de una serie incluye `seriesId` (UUID); las reservas sueltas no lo tienen. El pago, el no-show y la cancelación individual (`/:id/...`) operan sobre una ocurrencia y no afectan a las demás (RN-13). Para series, el `409` y el `422` nombran la fecha según el orden indicado abajo.
- **CR-01, orden de validación de series** (misma convención que el resto de la API): `401`/`403` → `400` → `404` cancha → `422` (se revisan todas las ocurrencias; el error nombra la primera fecha que falla, en orden de fecha) → `409` (primera fecha que choca, en orden de fecha). Si una fecha da `422` y otra `409`, responde `422`.
- **CR-01, orden de `cancel-future`:** `401`/`403` → `404` serie (no existe o, para el cliente, no es suya) → cancelación.
- `startTime` cumple `/^([01]\d|2[0-3]):(00|30)$/`; `durationMin` ∈ {60, 90, 120}.
- Teléfono `/^\+?[0-9 ]{7,15}$/`; contraseña ≥ 8; nombre 2–60; email válido y único.
- El precio lo calcula el servidor desde la cancha; el cliente nunca lo envía. El pago admite
  `amount` distinto del precio (descuento); no hay pagos parciales (RN-11).
- Los cambios en canchas no alteran reservas existentes (RN-10).
