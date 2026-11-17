# Historial de cambios

## [Sin publicar]

## [Ciclo 3]

- **CR-01 Reservas recurrentes (specs):** RF-15/RF-16, RN-12/RN-13 (todo-o-nada y ocurrencias independientes), CA-15…CA-18, endpoints de series en `api.md`, `bookings.seriesId?` e índice en `data-model.md`, ciclo 3 en `implementation-plan.md` y ADR-005 (#11).
- **CR-01 Reservas recurrentes (código):** series semanales de 2 a 8 semanas, todo-o-nada con `409`/`422` que nombran la fecha, `seriesId`, «cancelar las próximas», rutas de cliente y admin, y UI «Repetir cada semana» con Mis reservas agrupado por serie (#12).
- **CR-01 Pruebas y cierre:** `tests/e2e/series.e2e.ts` (CA-15…CA-18), fixture `seedPastBooking` con `seriesId`, sección «Evidencia CR-01» en `docs/testing.md` y README final. 90 `bun test` y 20 e2e en verde (#13).
- **Correcciones de la revisión final:** gestión de series en el backoffice (badge «Serie» y «Cancelar las próximas de la serie»), horas ya iniciadas ocultas al crear reserva para hoy, minutos de horario `00|30`, «Cobrados» incluye todo lo pagado (con «Cancelada»), `spaceIds` repetidos rechazados, mensaje sin canchas, y README con limitaciones conocidas (#14).
- Pendiente: publicar las ramas, abrir los PR y verificar el CI en `main`.

## [Ciclo 2]

- Pruebas de aceptación e2e con Playwright (Chromium) para CA-01…CA-14: cliente, doble reserva con dos contextos de navegador, validaciones de registro y backoffice; BD `canchas_e2e` fresca por corrida (`bun run e2e:server`) y fixture de reservas pasadas (#9).

## [Ciclo 1]

- Especificaciones ODD/SDD (RN-01…RN-11, CA-01…CA-14), ADR y registro de IA (#1).
- Monorepo Bun, paquete compartido (tiempo, precios, reglas, esquemas Zod) y MongoDB local con replica set (#2).
- Módulo de API: disponibilidad y creación/cancelación de reservas con transacción e índice único en `slot_locks` (#3).
- Suite obligatoria de doble reserva (RN-01, RN-02; CA-05, CA-06) con prueba concurrente de 10 peticiones y CI en GitHub Actions con MongoDB 8 (#4).
