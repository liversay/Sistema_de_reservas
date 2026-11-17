# Pruebas

Estrategia (ver `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md` §9):

- **Unitarias (`bun test`):** bloques, precios, horario de atención, validaciones Zod.
- **Reglas críticas e integración (`bun test` + `mongod` local, BD de prueba):** RN-01 a RN-08; doble reserva obligatoria (misma cancha, mitad vs completa, 10 peticiones concurrentes → 1 éxito).
- **Aceptación (Playwright, `tests/e2e/*.e2e.ts`):** cada prueba nombra los CA que cubre.
- **CI:** GitHub Actions corre unitarias e integración en cada PR; Playwright corre localmente y su resultado se adjunta al PR.

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

Resultado de la última corrida local (Ciclo 1): `bun test` → 48 pass, 0 fail (8 archivos). Los CA de interfaz (e2e) se completan en la tarea 9.

| RN / CA | Prueba | Tipo | Estado |
|---|---|---|---|
| RN-01, CA-05 | `double-booking.test.ts`: "misma cancha mismo turno → 409", "solapamiento parcial 20:00/90 vs 21:00/60 → 409", "10 reservas concurrentes → exactamente 1 éxito y 9 ConflictError" (y `slot_locks` = 2) | integración | pasa |
| RN-02, CA-06 | `double-booking.test.ts`: "completa bloquea ambas mitades", "una mitad ocupada bloquea la completa", "completa 20:00/60 con Media A 20:30/60 → 409" | integración | pasa |
| RN-03, CA-03 | `bookings-core.test.ts` (bloque/duración inválidos), `time.test.ts`, `pricing.test.ts` | unitaria / integración | pasa |
| RN-04, CA-01 | `rules.test.ts`, `availability.test.ts` (estados pasado/cerrado) | unitaria / integración | pasa |
| RN-05 | `bookings-core.test.ts` ("turno pasado -> RuleError") | integración | pasa |
| RN-08 | `availability.test.ts` y `bookings-core.test.ts` (cancha inactiva) | integración | pasa |
| CA-01 | `availability.test.ts` | integración | pasa (e2e pendiente) |
| CA-02 | — | e2e | pendiente |
| CA-03 | `pricing.test.ts`, `bookings-core.test.ts` (precio guardado) | unitaria / integración | pasa (e2e pendiente) |
| CA-04 | `bookings-core.test.ts` (reserva con precio y bloques) | integración | pasa (e2e pendiente) |
| CA-05 | ver RN-01 | integración | pasa |
| CA-06 | ver RN-02 | integración | pasa |
| CA-07 | `bookings-core.test.ts` (`cancelBooking`) | integración | pasa (e2e pendiente) |
| CA-08 | `schemas.test.ts` | unitaria | parcial (API pendiente) |
| CA-09 | — | integración / e2e | pendiente |
| CA-10 | — | integración / e2e | pendiente |
| CA-11 | — | integración | pendiente |
| CA-12 | — | integración / e2e | pendiente |
| CA-13 | — | integración | pendiente |
| CA-14 | — | integración / e2e | pendiente |
