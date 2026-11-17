# Historial de cambios

## [Sin publicar]

## [Ciclo 4] — completado

### Cambio solicitado

- **CR-02 Reserva sin cuenta, fidelidad, horizonte y tablero (specs):** RF-17…RF-22, RN-14 (horizonte de 30 días), RN-15 (reserva sin cuenta con `guest`), RN-16 (club de socios con % configurable) y RN-05 también en la interfaz, CA-19…CA-25, sesión opcional y endpoints `settings/loyalty`, `bookings/calendar` y `payments/summary` en `api.md`, `settings`, `basePrice`, `discountPct` y método `yappy` en `data-model.md`, ciclo 4 y flujo CR-02 en `implementation-plan.md` y ADR-006. Modifica RF-04, RN-07, RN-09, CA-09 y CA-15 (marcado en cada uno) (#28).

### Implementación y pruebas

- **CR-02 API:** reserva sin cuenta (`guest`), descuento de socios con `settings/loyalty`, horizonte de 30 días, método `yappy`, `bookings/calendar` y `payments/summary` (#29, PR #34).
- **CR-02 web cliente:** reserva sin cuenta, «Socio −N %», tira de 31 días, horas en 12 h, bloques pasados no elegibles y «Club de socios» (#30, PR #35).
- **CR-02 backoffice:** tablero `/admin` con pestañas Reservas | Pagos, tarjeta de detalle, indicadores, desglose por método y % de socios (#31, PR #36).
- **CR-02 pruebas y evidencia:** `tests/e2e/cr02.e2e.ts` (CA-19…CA-25), e2e de CA-01…CA-18 adaptados, sección «Evidencia CR-02» en `docs/testing.md`, README y correcciones de spec (horizonte en `POST /api/admin/bookings`, CA-10/CA-11 como tablero). 128 `bun test` y 27 e2e en verde, dos corridas seguidas (#32).

## [Ciclo 3]

- **CR-01 Reservas recurrentes (specs):** RF-15/RF-16, RN-12/RN-13 (todo-o-nada y ocurrencias independientes), CA-15…CA-18, endpoints de series en `api.md`, `bookings.seriesId?` e índice en `data-model.md`, ciclo 3 en `implementation-plan.md` y ADR-005 (#11).
- **CR-01 Reservas recurrentes (código):** series semanales de 2 a 8 semanas, todo-o-nada con `409`/`422` que nombran la fecha, `seriesId`, «cancelar las próximas», rutas de cliente y admin, y UI «Repetir cada semana» con Mis reservas agrupado por serie (#12).
- **CR-01 Pruebas y cierre:** `tests/e2e/series.e2e.ts` (CA-15…CA-18), fixture `seedPastBooking` con `seriesId`, sección «Evidencia CR-01» en `docs/testing.md` y README final. 90 `bun test` y 20 e2e en verde (#13).
- **Correcciones de la revisión final:** gestión de series en el backoffice (badge «Serie» y «Cancelar las próximas de la serie»), horas ya iniciadas ocultas al crear reserva para hoy, minutos de horario `00|30`, «Cobrados» incluye todo lo pagado (con «Cancelada»), `spaceIds` repetidos rechazados, mensaje sin canchas, y README con limitaciones conocidas (#14).
- Publicado: PRs #15–#26 mergeados en `main` con CI en verde; CI fijado a `ubuntu-24.04` (#17).

## [Ciclo 2]

- Pruebas de aceptación e2e con Playwright (Chromium) para CA-01…CA-14: cliente, doble reserva con dos contextos de navegador, validaciones de registro y backoffice; BD `canchas_e2e` fresca por corrida (`bun run e2e:server`) y fixture de reservas pasadas (#9).

## [Ciclo 1]

- Especificaciones ODD/SDD (RN-01…RN-11, CA-01…CA-14), ADR y registro de IA (#1).
- Monorepo Bun, paquete compartido (tiempo, precios, reglas, esquemas Zod) y MongoDB local con replica set (#2).
- Módulo de API: disponibilidad y creación/cancelación de reservas con transacción e índice único en `slot_locks` (#3).
- Suite obligatoria de doble reserva (RN-01, RN-02; CA-05, CA-06) con prueba concurrente de 10 peticiones y CI en GitHub Actions con MongoDB 8 (#4).
