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

**Reservas en el pasado (CA-10, CA-12, CA-13, CA-07 422):** la API rechaza turnos pasados (RN-05) y el reloj del servidor es real, así que el fixture `seedPastBooking` (`tests/e2e/fixtures.ts`) escribe directo en MongoDB `canchas_e2e` una reserva `confirmada` con pago `pendiente` y sus `slot_locks`, con la misma forma que `createBooking` (`src/api/bookings/service.ts`). Todo lo demás pasa por la UI o la API real.

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

Resultado de la corrida local (Ciclo 3, tarea 12, rama `test/13-series-cierre`): `bunx playwright test` → **20 e2e en verde** (2 corridas seguidas sobre BD fresca: 16 de CA-01…CA-14 + 4 de CA-15…CA-18) y `bun test` → **90 pass, 0 fail** (12 archivos). En el Ciclo 2 (tarea 9) eran 16 e2e y 73 `bun test`.

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
| CA-15 *(CR-01)* | `series.e2e.ts` «CA-15 el cliente repite cada semana…» (casilla «Repetir cada semana», 4 semanas, total $80, aviso «Serie confirmada: 4 reservas.», un grupo en Mis reservas, mismo `seriesId`, fechas +7·k, pago pendiente, `weeks` 1 y 9 → 400); `series.test.ts` «crear serie (CA-15)» | e2e + integración | ✔ pasa |
| CA-16 *(CR-01)* | `series.e2e.ts` «CA-16 serie todo-o-nada…» (otro cliente ocupa la 3.ª fecha → «Ese horario ya fue tomado el <fecha>. Elige otro.» en UI y API, 0 reservas creadas, las otras 3 fechas siguen libres, 422 fuera de horario, con 2 semanas sí se crea); `series.test.ts` «todo-o-nada», «cancha divisible» (Media A/Completa), «fecha pasada» y «concurrencia» | e2e + integración | ✔ pasa |
| CA-17 *(CR-01)* | `series.e2e.ts` «CA-17 cancelar las próximas…» (UI «Cancelar las próximas», 2 canceladas y 2 ya jugadas intactas, repetir → `{ cancelled: 0 }`, serie ajena e inexistente → 404, horarios liberados); `series.test.ts` «ocurrencias independientes» con `now` inyectado | e2e + integración | ✔ pasa |
| CA-18 *(CR-01)* | `series.e2e.ts` «CA-18 el admin crea una serie para un invitado…» (formulario Nueva reserva con «Repetir cada semana», `createdBy: admin` e invitado en las 3, cobro de una ocurrencia jugada no cambia las demás, la futura → 422, sin teléfono 400, choque 409 con fecha y sin crear nada); `series.test.ts` «cada ocurrencia se cobra por separado» | e2e + integración | ✔ pasa |
| RN-12 / RN-13 *(CR-01)* | `series.test.ts` («todo-o-nada», «ocurrencias independientes») y los e2e CA-16/CA-17/CA-18 | integración + e2e | ✔ pasa |

**Series con ocurrencias ya empezadas (CA-17, CA-18).** El servidor e2e usa el reloj real y la API no crea ocurrencias pasadas (RN-04), así que `series.e2e.ts` arma la serie como existiría semanas después: las ocurrencias futuras se crean con la API real (`POST /api/bookings/series` o el formulario del admin) y las ya jugadas se siembran con `seedPastBooking` pasándole el mismo `seriesId` (opción `seriesId` del fixture; también acepta `daysAgo` negativo). El inicio de la serie «con `now` intermedio» (CA-17/CA-18 en la spec) se prueba con `now` inyectado en `series.test.ts`.

**Límites conocidos de la cobertura e2e.** El estado `pasado` de la grilla y «borrar cancha» (la UI no ofrece borrar; el 409 se prueba por API) no se verifican en navegador porque dependen de la hora real de la corrida; los cubren `availability.test.ts` y `admin.test.ts`. «Pádel 1 en mantenimiento» de CA-01 se prueba con Media A en CA-14.

## Evidencia CR-01

Recorrido completo del cambio de requerimiento CR-01 (reservas recurrentes): cambio solicitado → spec → criterios de aceptación → plan → código → pruebas → resultado.

| Paso | Qué ocurrió | Evidencia |
|---|---|---|
| 1. Cambio solicitado | 2026-11-17, issue [#11](https://github.com/liversay/Sistema_de_reservas/issues/11): «Un equipo quiere reservar la misma cancha todos los jueves a las 20:00 durante varias semanas.» Los ciclos 1 y 2 no dejaron nada preparado para series (sin `seriesId`). | Issue #11; `specs/implementation-plan.md` («Flujo del cambio CR-01») |
| 2. Cambio de spec (rama `docs/11-cr-01-recurrentes`, Diegoalevq) | RF-15/RF-16 y RN-12/RN-13; CA-15…CA-18; contratos de API y `bookings.seriesId?` con su índice; plan del ciclo 3, ADR-005 y CHANGELOG; orden de validación de series y mensaje con fecha | `5092733` `specs/requirements.md`, `specs/business-rules.md` · `6434da1` `specs/acceptance-criteria.md` · `41fa2ea` `specs/api.md`, `specs/data-model.md` · `ab05984` `specs/implementation-plan.md`, `docs/decisions.md` (ADR-005), `CHANGELOG.md`, `docs/ai-log.md` · `21cf8d4` `specs/*` (orden de validación, mensaje «…tomado el <fecha>…», CA-16/CA-18) |
| 3. Criterios de aceptación | CA-15 crear serie · CA-16 todo-o-nada ante conflicto · CA-17 cancelar las próximas · CA-18 serie del admin y pago por ocurrencia | `specs/acceptance-criteria.md` |
| 4. Plan | Ciclo 3: tarea 10 Spec (Diegoalevq) → tarea 11 Dev (liversay, issue #12) → tarea 12 QA (aaronbatistaa, issue #13) | `specs/implementation-plan.md` |
| 5. Código (rama `feat/12-series`, liversay) | `d4803e5` API de series (`createSeries`, `cancelFutureInSeries`, rutas, índice) · `b77c704` tipado de la colección en las pruebas · `fac0be1` web: «Repetir cada semana», Mis reservas por serie, «Cancelar las próximas» · `054a9d0` cancelar dentro de la transacción, CA-16 divisible/pasado y ajustes de UI | `src/api/bookings/service.ts`, `src/api/routes/*`, `src/shared/*`, `src/web/src/components/RepeatOption.tsx`, `src/web/src/pages/MyBookings.tsx` |
| 6. Pruebas (rama `test/13-series-cierre`, aaronbatistaa) | Integración: `tests/integration/series.test.ts` (API con BD de prueba y `now` inyectado). Aceptación: `tests/e2e/series.e2e.ts` (CA-15…CA-18 en navegador). Commit `8c23c59` (#13) | ver tabla CA → prueba |
| 7. Resultados | `bun test` → **90 pass, 0 fail** · `bunx playwright test` → **20 passed** (16 previos + 4 de series), dos corridas seguidas sobre BD `canchas_e2e` fresca; las pruebas previas siguen en verde (sin regresión) | corrida local del 2026-11-17 |

**Conflicto de series.** Una serie es todo-o-nada (RN-12): ante un choque (409) o una regla incumplida (422) responde con la primera fecha afectada («Ese horario ya fue tomado el 2026-12-03. Elige otro.») y no deja ninguna reserva. Una vez creada, cada ocurrencia es independiente (RN-13): se cancela, se cobra y se marca «no se presentó» por separado.

**Enlaces de revisión**

- Issues: [#11 specs](https://github.com/liversay/Sistema_de_reservas/issues/11), [#12 código](https://github.com/liversay/Sistema_de_reservas/issues/12), [#13 pruebas y cierre](https://github.com/liversay/Sistema_de_reservas/issues/13)
- PR: spec [#23](https://github.com/liversay/Sistema_de_reservas/pull/23) (Closes #11) → código [#24](https://github.com/liversay/Sistema_de_reservas/pull/24) (Closes #12) → pruebas y cierre [#25](https://github.com/liversay/Sistema_de_reservas/pull/25) (Closes #13); correcciones de la revisión final [#26](https://github.com/liversay/Sistema_de_reservas/pull/26).
- CI verde: el check de GitHub Actions pasó en cada PR antes del merge (#17–#26). Nota: el primer run falló porque `ubuntu-latest` (26.04) no tiene paquetes de MongoDB 8; se fijó `ubuntu-24.04` en #17.
