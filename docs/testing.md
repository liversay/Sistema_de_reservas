# Pruebas

Estrategia (ver `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md` §9):

- **Unitarias (`bun test`):** bloques, precios, horario de atención, validaciones Zod.
- **Reglas críticas e integración (`bun test` + `mongod` local, BD de prueba):** RN-01 a RN-08; doble reserva obligatoria (misma cancha, mitad vs completa, 10 peticiones concurrentes → 1 éxito).
- **Aceptación (Playwright, `tests/e2e/*.e2e.ts`):** cada prueba nombra los CA que cubre.
- **CI:** GitHub Actions corre unitarias e integración en cada PR; Playwright corre localmente y su resultado se adjunta al PR.

## Cómo correr las pruebas e2e

```bash
bun run db:start          # MongoDB rs0 en el puerto 27027
bunx playwright install chromium   # una sola vez
bunx playwright test      # o: bun run e2e
```

`playwright.config.ts` arranca `bun run e2e:server` (`scripts/e2e-server.ts`): **borra la BD `canchas_e2e`**, la deja sembrada desde cero (la siembra la API al arrancar) y levanta API (3000) y Vite (5173). Es fresca en cada corrida y no toca la BD `canchas` de desarrollo. Los puertos 3000 y 5173 deben estar libres (`reuseExistingServer: false`). `workers: 1`, solo Chromium, archivos `tests/e2e/*.e2e.ts` (nunca `.spec.ts`, para que `bun test` no los recoja).

**Reservas en el pasado (CA-10, CA-12, CA-13, CA-07 422):** la API rechaza turnos pasados (RN-04) y el reloj del servidor es real, así que el fixture `seedPastBooking` (`tests/e2e/fixtures.ts`) escribe directo en MongoDB `canchas_e2e` una reserva `confirmada` con pago `pendiente` y sus `slot_locks`, con la misma forma que `createBooking` (`src/api/bookings/service.ts`). Todo lo demás pasa por la UI o la API real.

Las fechas son relativas a hoy (`dayOffset`), dentro de la tira de 7 días; cada prueba usa una combinación cancha/hora distinta para no depender del orden.



## Cómo correr

```bash
bun install
bun run db:start          # MongoDB local, replica set rs0 en 127.0.0.1:27027
bun test                  # unitarias + integración
bun test tests/integration/double-booking.test.ts   # suite de doble reserva
bun run test:unit         # solo unitarias
```

Las pruebas de integración crean una BD aleatoria (`canchas_test_*`) y la eliminan al terminar. En CI (`.github/workflows/ci.yml`) se instala MongoDB 8 desde el repositorio apt oficial, se ejecuta `bun run db:start` y `bun test`.

## Tabla RN/CA → prueba

Resultado de la corrida local (Ciclo 2, tarea 9): `bunx playwright test` → **16 e2e en verde** (2 corridas seguidas sobre BD fresca) y `bun test` → 73 pass, 0 fail.

| RN / CA | Prueba | Tipo | Estado |
|---|---|---|---|
| RN-01 | `double-booking.test.ts`: misma cancha mismo turno → 409, solape parcial → 409, 10 concurrentes → exactamente 1 éxito | integración | ✔ pasa |
| RN-02 | `double-booking.test.ts`: la completa bloquea ambas mitades y una mitad ocupada bloquea la completa | integración | ✔ pasa |
| RN-03 | `bookings-core.test.ts` (bloque/duración inválidos), `time.test.ts`, `pricing.test.ts` | unitaria + integración | ✔ pasa |
| RN-04 | `rules.test.ts`, `availability.test.ts` (estados pasado/cerrado) | unitaria + integración | ✔ pasa |
| RN-05 | `bookings-core.test.ts` («turno pasado → RuleError») | integración | ✔ pasa |
| RN-08 | `availability.test.ts` y `bookings-core.test.ts` (cancha inactiva) | integración | ✔ pasa |
| CA-01 | `cliente.e2e.ts` «CA-01 el cliente ve la disponibilidad…»; `availability.test.ts` | e2e + integración | ✔ pasa |
| CA-02 | `cliente.e2e.ts` «CA-02 el filtro por deporte…» | e2e | ✔ pasa |
| CA-03 | `cliente.e2e.ts` «CA-03 elegir duración recalcula…»; `pricing.test.ts` | e2e + unitaria | ✔ pasa |
| CA-04 | `cliente.e2e.ts` «CA-04 cliente reserva un turno libre»; `api-bookings.test.ts` | e2e + integración | ✔ pasa |
| CA-05 | `doble-reserva.e2e.ts` «CA-05 dos usuarios mismo turno…» (2 contextos) y «solape parcial…»; `double-booking.test.ts` (10 concurrentes → 1) | e2e + integración | ✔ pasa |
| CA-06 | `doble-reserva.e2e.ts` «CA-06 completa no disponible si una mitad está ocupada…» y «completa reservada bloquea Media A y Media B…»; `double-booking.test.ts` | e2e + integración | ✔ pasa |
| CA-07 | `cliente.e2e.ts` «CA-07 cancelar libera el turno…» (también 404 ajena y 422 iniciada); `api-bookings.test.ts` | e2e + integración | ✔ pasa |
| CA-08 | `validaciones.e2e.ts` «CA-08 registro con datos inválidos…» (email, teléfono, clave de 7, nombre de 1; válido; duplicado); `auth.test.ts`, `schemas.test.ts` | e2e + integración + unitaria | ✔ pasa |
| CA-09 | `cliente.e2e.ts` «CA-09 inicio de sesión…» (clave mala, vuelta a la selección, `me`, logout, reservar sin sesión 401); `auth.test.ts` | e2e + integración | ✔ pasa |
| CA-10 | `backoffice.e2e.ts` «CA-10 admin ve las reservas del día…» (confirmada, cancelada, jugada; cancelar libera; 403/401); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-11 | `backoffice.e2e.ts` «CA-11 admin crea una reserva para un invitado…» (campos obligatorios, 409 exacto, 400 y 422 por API); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-12 | `backoffice.e2e.ts` «CA-12 el admin cobra una reserva jugada…» (422 antes de jugar, monto prellenado y ajustado, transferencia, sale de «por cobrar», aparece en «cobrados», 2.º pago 409); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-13 | `backoffice.e2e.ts` «CA-13 no se presentó…» (422 antes de terminar, sale de «por cobrar», pago posterior 409); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-14 | `backoffice.e2e.ts` «CA-14 configurar canchas…» (precio nuevo, horario recortado → «cerrado», mantenimiento, 409 al borrar con reservas, alta de «Pádel 2»); `admin.test.ts` | e2e + integración | ✔ pasa |

**Límites conocidos de la cobertura e2e.** El estado `pasado` de la grilla y «borrar cancha» (la UI no ofrece borrar; el 409 se prueba por API) no se verifican en navegador porque dependen de la hora real de la corrida; los cubren `availability.test.ts` y `admin.test.ts`. «Pádel 1 en mantenimiento» de CA-01 se prueba con Media A en CA-14.
