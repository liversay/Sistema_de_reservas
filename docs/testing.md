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

Las fechas son relativas a hoy (`dayOffset`), dentro del horizonte de 30 días (RN-14; las pruebas usan de −9 a +31 días, y +31 solo para comprobar el rechazo); cada prueba usa una combinación cancha/hora distinta para no depender del orden.



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

Resultado de la corrida local (Ciclo 4, tarea 17, rama `test/32-cr-02-qa`): `bunx playwright test` → **27 e2e en verde** (2 corridas seguidas sobre BD fresca: 20 de CA-01…CA-18 adaptados a CR-02 + 7 nuevos de CA-19…CA-25) y `bun test` → **128 pass, 0 fail** (14 archivos). Ciclo 3: 20 e2e y 90 `bun test`; ciclo 2: 16 e2e y 73 `bun test`.

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
| CA-04 *(CR-02)* | `cliente.e2e.ts` «CA-04 un visitante sin cuenta reserva…» (nombre y teléfono, precio 20 sin descuento, guardada como invitado; un socio ve $18 y su reserva en «Mis reservas»); `api-bookings.test.ts` | e2e + integración | ✔ pasa |
| CA-05 | `doble-reserva.e2e.ts` «CA-05 dos usuarios mismo turno…» (2 contextos) y «solape parcial…»; `double-booking.test.ts` (10 concurrentes → 1) | e2e + integración | ✔ pasa |
| CA-06 | `doble-reserva.e2e.ts` «CA-06 completa no disponible si una mitad está ocupada…» y «completa reservada bloquea Media A y Media B…»; `double-booking.test.ts` | e2e + integración | ✔ pasa |
| CA-07 | `cliente.e2e.ts` «CA-07 cancelar libera el turno…» (también 404 ajena y 422 iniciada); `api-bookings.test.ts` | e2e + integración | ✔ pasa |
| CA-08 | `validaciones.e2e.ts` «CA-08 registro con datos inválidos…» (email, teléfono, clave de 7, nombre de 1; válido; duplicado); `auth.test.ts`, `schemas.test.ts` | e2e + integración + unitaria | ✔ pasa |
| CA-09 *(CR-02)* | `cliente.e2e.ts` «CA-09 inicio de sesión…» («Ingresa» desde el panel, «Club de socios», clave mala, vuelta a la selección ya como socio, `me`, logout; `mine` sin sesión 401 y reservar sin `guest` 400, ya no 401); `auth.test.ts` | e2e + integración | ✔ pasa |
| CA-10 *(CR-02)* | `backoffice.e2e.ts` «CA-10 admin ve las reservas del día en el tablero…» (barras confirmada/jugada, cancelada listada aparte, tarjeta, cancelar libera; 409 repetido; 403/401); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-11 *(CR-02)* | `backoffice.e2e.ts` «CA-11 admin crea una reserva para un invitado…» (campos obligatorios, hora en 12 h, barra en el tablero, 409 exacto, 400 y 422 por API, 422 de horizonte hoy+31); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-12 *(CR-02)* | `backoffice.e2e.ts` «CA-12 el admin cobra una reserva jugada desde la tarjeta…» (422 antes de jugar, 4 métodos, monto prellenado y ajustado, transferencia, sale de «por cobrar», indicadores y barra «pagado», 2.º pago 409, monto 0 y método inválido 400); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-13 *(CR-02)* | `backoffice.e2e.ts` «CA-13 no se presentó…» (422 antes de terminar, acción desde la tarjeta, sale de «por cobrar», cuenta como no-show, pago posterior 409); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-14 *(CR-02)* | `backoffice.e2e.ts` «CA-14 configurar canchas…» (precio nuevo con descuento de socio $49.50, reserva previa intacta, horario recortado → «cerrado», mantenimiento, 409 al borrar con reservas, alta de «Pádel 2»); `admin.test.ts` | e2e + integración | ✔ pasa |
| CA-15 *(CR-01, CR-02)* | `series.e2e.ts` «CA-15 el cliente repite cada semana…» (casilla «Repetir cada semana», 4 semanas, socio: total $72 = 4 × $18, aviso «Serie confirmada: 4 reservas.», un grupo en Mis reservas, mismo `seriesId`, fechas +7·k, pago pendiente, `weeks` 1 y 9 → 400); `series.test.ts` «crear serie (CA-15)» | e2e + integración | ✔ pasa |
| CA-16 *(CR-01)* | `series.e2e.ts` «CA-16 serie todo-o-nada…» (otro cliente ocupa la 3.ª fecha → «Ese horario ya fue tomado el <fecha>. Elige otro.» en UI y API, 0 reservas creadas, las otras 3 fechas siguen libres, 422 fuera de horario, con 2 semanas sí se crea); `series.test.ts` «todo-o-nada», «cancha divisible» (Media A/Completa), «fecha pasada» y «concurrencia» | e2e + integración | ✔ pasa |
| CA-17 *(CR-01)* | `series.e2e.ts` «CA-17 cancelar las próximas…» (UI «Cancelar las próximas», 2 canceladas y 2 ya jugadas intactas, repetir → `{ cancelled: 0 }`, serie ajena e inexistente → 404, horarios liberados); `series.test.ts` «ocurrencias independientes» con `now` inyectado | e2e + integración | ✔ pasa |
| CA-18 *(CR-01)* | `series.e2e.ts` «CA-18 el admin crea una serie para un invitado…» (formulario Nueva reserva con «Repetir cada semana», `createdBy: admin` e invitado en las 3, cobro de una ocurrencia jugada no cambia las demás, la futura → 422, sin teléfono 400, choque 409 con fecha y sin crear nada); `series.test.ts` «cada ocurrencia se cobra por separado» | e2e + integración | ✔ pasa |
| RN-12 / RN-13 *(CR-01)* | `series.test.ts` («todo-o-nada», «ocurrencias independientes») y los e2e CA-16/CA-17/CA-18 | integración + e2e | ✔ pasa |
| CA-19 *(CR-02)* | `cr02.e2e.ts` «CA-19 reservar sin cuenta…» (errores por campo en español, reserva confirmada a nombre del invitado, API sin sesión 201 con `guest`/400 sin `guest` o inválido/409 exacto, serie con y sin `guest`, `mine` y cancelar 401, con sesión `guest` se ignora, solo se crearon las reservas válidas); `cr02.test.ts` «RN-15» | e2e + integración | ✔ pasa |
| CA-20 *(CR-02)* | `cr02.e2e.ts` «CA-20 socio con sesión…» («Socio: −10 %», $50 tachado y $45, `basePrice` 50 / `discountPct` 10 / `price` 45, Pádel $20 → $18, sin sesión $50, «Club de socios» con la tarjeta ≥ 32 px bajo el encabezado a 1280 y 390 px en login y registro, sin desborde); `cr02.test.ts` «RN-16» | e2e + integración | ✔ pasa |
| CA-21 *(CR-02)* | `cr02.e2e.ts` «CA-21 horizonte de 30 días…» (hoy+30 `201`, hoy+31 `422` con mensaje exacto y nada creado; serie de 4 con 4.ª fuera `422` nombrando la fecha y 0 creadas, de 3 sí; admin igual; tira de 31 días, `min`/`max` del selector, `?fecha=` fuera de rango vuelve a hoy, serie deshabilitada el último día, tablero sin bloques libres pasado el horizonte); `cr02.test.ts` «RN-14» | e2e + integración | ✔ pasa |
| CA-22 *(CR-02)* | `cr02.e2e.ts` «CA-22 sin horas pasadas y horas en 12 h…» (Pádel 1 abierto desde las 12:00 a. m.: bloques iniciados «ya pasó» y sin botón, clic sin efecto, API `422` y estado `pasado`, etiquetas 12:00 a. m./12:30 a. m./8:00 a. m./12:00 p. m./8:00 p. m., fecha larga, sin horas en 24 h en `/`, `/mis-reservas`, `/ingresar`, `/admin`, `/admin?vista=pagos` y `/admin/canchas`, «Nueva reserva» solo ofrece desde el bloque siguiente); `format.test.ts` | e2e + unitaria | ✔ pasa |
| CA-23 *(CR-02)* | `cr02.e2e.ts` «CA-23 tablero de Reservas…» (una fila por cancha, barras jugada/no se presentó con nombre accesible y hora en 12 h, cancelada aparte, tarjeta `role="dialog"` con teléfono, fecha larga, precio con descuento, pago, «Terminó»/«Por jugar», acciones según estado, hover, foco y Esc, puntos de la tira y `calendar` 400/401/403, bloque libre prellena «Nueva reserva», cancelar y cancelar la serie desde la tarjeta, 390 px con scroll interno y hoja modal); `cr02.test.ts` «calendar y summary» | e2e + integración | ✔ pasa |
| CA-24 *(CR-02)* | `cr02.e2e.ts` «CA-24 tablero de pagos…» (cobro por Yappy desde la tarjeta, `payments/summary` = 190 / 30 / 1 / 6 / 1 y `byMethod` incl. Yappy, 401/403, pestaña Pagos sin recarga con `?vista=pagos`, KPIs y por método = API, barras pagado/por cobrar/no aplica, semana = API, `/admin/pagos` redirige, 390 px); `cr02.test.ts` «calendar y summary», «pago yappy» | e2e + integración | ✔ pasa |
| CA-25 *(CR-02)* | `cr02.e2e.ts` «CA-25 el admin configura el % de socios…» (15 `200` y GET público, 51/−1/10.5/texto `400` sin cambio, 0 y 50 válidos, 403/401, tarjeta del tablero de Pagos con error y guardado, reserva previa conserva 10 %, nueva 20 % = $40, sin sesión $50, la web muestra «Socio: −20 %»; restaura 10 %); `cr02.test.ts` «RN-16 fidelidad» | e2e + integración | ✔ pasa |
| RN-14 / RN-15 / RN-16 *(CR-02)* | `cr02.test.ts` (horizonte, reserva sin cuenta, fidelidad) y los e2e CA-19…CA-21, CA-25 | integración + e2e | ✔ pasa |

**Series con ocurrencias ya empezadas (CA-17, CA-18).** El servidor e2e usa el reloj real y la API no crea ocurrencias pasadas (RN-04), así que `series.e2e.ts` arma la serie como existiría semanas después: las ocurrencias futuras se crean con la API real (`POST /api/bookings/series` o el formulario del admin) y las ya jugadas se siembran con `seedPastBooking` pasándole el mismo `seriesId` (opción `seriesId` del fixture; también acepta `daysAgo` negativo). El inicio de la serie «con `now` intermedio» (CA-17/CA-18 en la spec) se prueba con `now` inyectado en `series.test.ts`.

**Límites conocidos de la cobertura e2e.** «Borrar cancha» (la UI no ofrece borrar; el 409 se prueba por API) no se verifica en navegador; lo cubre `admin.test.ts`. El estado `pasado` sí se verifica en navegador desde CR-02 (CA-22), ampliando el horario de Pádel 1 durante la prueba. «Pádel 1 en mantenimiento» de CA-01 se prueba con Media A en CA-14.

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

## Evidencia CR-02

Recorrido completo del cambio de requerimiento CR-02 (reserva sin cuenta, club de socios, horizonte de 30 días, horas en 12 h y tablero del backoffice): cambio solicitado → issue → spec → criterios de aceptación → plan → código → pruebas → resultados.

| Paso | Qué ocurrió | Evidencia |
|---|---|---|
| 1. Cambio solicitado | 2026-11-17, el usuario pidió siete puntos: (1) reservar sin crear cuenta, con nombre y teléfono; (2) descuento para socios con sesión (Club de socios), configurable; (3) reservar hasta 1 mes de antelación (antes la interfaz mostraba 7 días); (4) horas en 12 h («8:00 p. m.») en toda la interfaz; (5) no poder elegir horas que ya pasaron; (6) backoffice con un tablero de canchas × horas con tarjeta de detalle al pasar el cursor; (7) un tablero de pagos con indicadores y desglose por método, incluido Yappy. Además corregir el espaciado de la tarjeta de login. | Issue [#28](https://github.com/liversay/Sistema_de_reservas/issues/28); `docs/superpowers/plans/2026-11-17-cr-02.md` |
| 2. Spec (rama `docs/28-cr-02`, liversay) | RF-17…RF-22, RN-14 (horizonte), RN-15 (reserva sin cuenta), RN-16 (fidelidad), CA-19…CA-25 y cambios marcados en CA-04, CA-09, CA-10, CA-12 y CA-15; contratos de API, modelo, plan del ciclo 4, ADR-006 y CHANGELOG; ajustes de revisión | PR [#33](https://github.com/liversay/Sistema_de_reservas/pull/33): `9db609d` plan · `7f07ff5` RF/RN/CA · `c870bf0` API y modelo · `184e793` ciclo 4, ADR-006, CHANGELOG, ai-log · `cdb66c8` ajustes de revisión |
| 3. Criterios de aceptación | CA-19 sin cuenta · CA-20 socio y «Club de socios» · CA-21 horizonte · CA-22 pasado y 12 h · CA-23 tablero de reservas · CA-24 tablero de pagos · CA-25 % de socios | `specs/acceptance-criteria.md` |
| 4. Plan | `docs/superpowers/plans/2026-11-17-cr-02.md`; ciclo 4: tarea 13 Spec (liversay, #28) → 14 API (aaronbatistaa, #29) → 15 web cliente (#30) → 16 backoffice (#31) → 17 QA (Diegoalevq, #32) | `specs/implementation-plan.md` |
| 5. Código (aaronbatistaa) | API: sesión opcional, `guest`, descuento, horizonte, Yappy, `settings/loyalty`, `bookings/calendar`, `payments/summary`. Web cliente: formulario sin cuenta, «Socio −N %», tira de 31 días, 12 h, bloques pasados, «Club de socios». Backoffice: tablero con pestañas Reservas \| Pagos, tarjeta de detalle e indicadores | PR [#34](https://github.com/liversay/Sistema_de_reservas/pull/34) (Closes #29): `d774903`, `b1d34d3`, `ad1050d` · PR [#35](https://github.com/liversay/Sistema_de_reservas/pull/35) (Closes #30): `2ea2ead`, `bea738b`, `a56647b` · PR [#36](https://github.com/liversay/Sistema_de_reservas/pull/36) (Closes #31): `67ae7e3`, `58700ce`, `160d5ca`, `64fa430` |
| 6. Pruebas (rama `test/32-cr-02-qa`, Diegoalevq) | Integración: `tests/integration/cr02.test.ts`. e2e: `tests/e2e/cr02.e2e.ts` (CA-19…CA-25) y adaptación de CA-01…CA-18 (12 h, invitado, descuento, tablero, tarjeta) sin debilitar aserciones | ver tabla CA → prueba |
| 7. Resultados | `bun test` → **128 pass, 0 fail** (14 archivos) · `bunx playwright test` → **27 passed** (20 adaptados + 7 nuevos), dos corridas seguidas sobre BD `canchas_e2e` fresca · tsc sin errores | corrida local del 2026-11-17; PR de pruebas y evidencia «CR-02: pruebas y evidencia» (Closes #32) |

**Antes de adaptar los e2e** (con el código de #34–#36 en `main`) fallaban 18 de los 20 e2e previos por cambios de comportamiento previstos: CA-04 y CA-09 (reservar sin sesión), CA-15 (precio de socio $18), CA-10…CA-14 (tabla y página de pagos reemplazadas por el tablero) y CA-17/CA-18 (etiquetas en 12 h, tarjeta); el resto eran esperas agotadas sobre esas mismas pantallas. Ningún fallo era un defecto del producto.

**Pruebas con reloj real.** El servidor e2e usa la hora real. Para CA-22 se abre Pádel 1 desde las 12:00 a. m. durante la prueba (y se restaura en `finally`), de modo que siempre existan bloques ya iniciados hoy; la prueba se omite a partir de las 22:00. CA-23 y CA-24 siembran reservas de días pasados con `seedPastBooking` en días propios (−4 y −6). El % de socios es un ajuste global: CA-25 lo cambia y lo restaura a 10 en `finally`.

**Observación menor (no bloqueante).** En el tablero, si el cursor sigue sobre una barra, Esc cierra la tarjeta fijada pero la vista previa por cursor reaparece (la prueba aparta el cursor antes de pulsar Esc). Con teclado no ocurre.
