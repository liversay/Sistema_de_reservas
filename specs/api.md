# API HTTP

Base `/api`, JSON. Fechas `YYYY-MM-DD`, horas `HH:MM`. Sesión por cookie firmada httpOnly.

## Códigos de error

| Código | Uso |
|---|---|
| 400 | Entrada inválida (Zod) |
| 401 | Sin sesión |
| 403 | Sin rol admin |
| 404 | No existe |
| 409 | Choque o estado incompatible |
| 422 | Regla de negocio (horario, pasado, pago antes de jugar) |

Mensaje de choque exacto: `"Ese horario ya fue tomado. Elige otro."`

## Público

| Método y ruta | Descripción | CA |
|---|---|---|
| `GET /api/availability?date=` | Canchas activas con el estado de cada bloque de 30 min (libre/ocupado/fuera de horario). `400` si la fecha es inválida. | CA-01, CA-02, CA-03 |

## Auth

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `POST /api/auth/register` | `{ name, email, phone, password }` | 201 usuario + sesión; 400 inválido; 409 email repetido | CA-08 |
| `POST /api/auth/login` | `{ email, password }` | 200 usuario + sesión; 401 credenciales | CA-09 |
| `POST /api/auth/logout` | — | 204 | CA-09 |
| `GET /api/auth/me` | — | 200 usuario; 401 | CA-09 |

## Cliente (requiere sesión)

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `POST /api/bookings` | `{ courtId, date, startTime, durationMin }` | 201 reserva; 400; 401; 404 cancha; 409 choque; 422 horario/pasado/cancha inactiva | CA-04, CA-05, CA-06 |
| `GET /api/bookings/mine` | — | 200 reservas del usuario; 401 | CA-04 |
| `POST /api/bookings/:id/cancel` | — | 200 reserva cancelada; 401; 404 (no existe o no es suya); 409 ya cancelada; 422 ya empezó | CA-07 |

## Admin (rol admin: 401 sin sesión, 403 sin rol)

| Método y ruta | Cuerpo | Respuesta / errores | CA |
|---|---|---|---|
| `GET /api/admin/bookings?date=` | — | 200 reservas del día con estado, pago y cliente/invitado | CA-10 |
| `POST /api/admin/bookings` | `{ courtId, date, startTime, durationMin, guest: { name, phone } }` | 201; 400; 409; 422 | CA-11 |
| `POST /api/admin/bookings/:id/payment` | `{ amount > 0, method: "efectivo"\|"transferencia"\|"tarjeta" }` | 200 pago registrado (`paidBy` = admin); 404; 409 ya pagada, cancelada o `no_show`; 422 aún no terminó | CA-12 |
| `POST /api/admin/bookings/:id/no-show` | — | 200 `no_show`; 404; 409 no está `confirmada`; 422 aún no terminó | CA-13 |
| `POST /api/admin/bookings/:id/cancel` | — | 200; 404; 409 ya cancelada | CA-10 |
| `GET /api/admin/payments?status=pending` | — | 200 reservas por cobrar (`status=paid`: cobradas) | CA-12, CA-13 |
| `GET/POST /api/admin/courts` · `GET/PUT/DELETE /api/admin/courts/:id` | `{ name, sport, format?, spaceIds, active, prices, schedule }` | CRUD; incluye precios, horario y activo; `DELETE` responde 409 si la cancha tiene reservas | CA-14 |

## Notas

- `startTime` cumple `/^([01]\d|2[0-3]):(00|30)$/`; `durationMin` ∈ {60, 90, 120}.
- Teléfono `/^\+?[0-9 ]{7,15}$/`; contraseña ≥ 8; nombre 2–60.
- El precio lo calcula el servidor desde la cancha; el cliente nunca lo envía.
- Los cambios en canchas no alteran reservas existentes (RN-10).
