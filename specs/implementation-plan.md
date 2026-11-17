# Plan de implementación

Resumen de `docs/superpowers/plans/2026-11-16-reservas-canchas.md`. Cada tarea = issue → rama
`tipo/numero-descripcion` → commits pequeños con `(#n)` → PR → revisión de otro integrante → merge.
Los roles rotan por ciclo.

## Roles por ciclo

| Ciclo | Alcance | Product/Spec | Arquitectura/Dev | QA/DevOps |
|---|---|---|---|---|
| 1 | ODD + specs, monorepo, DB local, modelo, disponibilidad + regla anti-choque | liversay | aaronbatistaa | Diegoalevq |
| 2 | Reserva del cliente, cuentas, Mis reservas, backoffice | aaronbatistaa | Diegoalevq | liversay |
| 3 | Cambio de requerimiento (reservas recurrentes), pagos, README, cierre | Diegoalevq | liversay | aaronbatistaa |
| 4 | Cambio de requerimiento CR-02 (reserva sin cuenta, fidelidad, horizonte, tablero); la rotación vuelve a empezar | liversay | aaronbatistaa | Diegoalevq |

## Ciclo 1 (completado ✔)

Estado: ✔ implementado y verificado localmente (48 pruebas en verde). **Los PR de las tareas 2 a 4 están pendientes de push**; hasta entonces la rama de cada tarea vive en el clon de su autor y no hay revisión ni merge en `main`.

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 1 | liversay (Spec) | `docs/1-odd-sdd` | [#1](https://github.com/liversay/Sistema_de_reservas/issues/1) | ODD, specs, decisiones, ai-log |
| 2 | aaronbatistaa (Dev) | `feat/2-monorepo` | [#2](https://github.com/liversay/Sistema_de_reservas/issues/2) | Monorepo, MongoDB local, reglas puras en `src/shared` |
| 3 | aaronbatistaa (Dev) | `feat/3-reservas-core` | [#3](https://github.com/liversay/Sistema_de_reservas/issues/3) | Base de datos, disponibilidad, creación de reservas, slot_locks |
| 4 | Diegoalevq (QA) | `test/4-doble-reserva-ci` | [#4](https://github.com/liversay/Sistema_de_reservas/issues/4) | Suite de doble reserva (CA-05, CA-06) y CI |

## Ciclo 2 (completado ✔)

Estado: ✔ tareas 5 a 9 implementadas y verificadas localmente (73 pruebas `bun test` y 16 e2e en verde). La tarea 5 fijó los contratos de `specs/api.md` y las pruebas previstas por CA en `specs/acceptance-criteria.md` antes de que Dev implementara.

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 5 | aaronbatistaa (Spec) | `docs/5-specs-ciclo-2` | [#5](https://github.com/liversay/Sistema_de_reservas/issues/5) | Afinar specs del ciclo 2 |
| 6 | Diegoalevq (Dev) | `feat/6-api` | [#6](https://github.com/liversay/Sistema_de_reservas/issues/6) | API HTTP: auth, reservas y admin |
| 7 | Diegoalevq (Dev) | `feat/7-web-cliente` | [#7](https://github.com/liversay/Sistema_de_reservas/issues/7) | Web cliente |
| 8 | Diegoalevq (Dev) | `feat/8-backoffice` | [#8](https://github.com/liversay/Sistema_de_reservas/issues/8) | Web backoffice |
| 9 | liversay (QA) | `test/9-e2e` | [#9](https://github.com/liversay/Sistema_de_reservas/issues/9) | Pruebas de aceptación e2e (Playwright) |

## Ciclo 3 (cambio de requerimiento, completado ✔)

Estado: ✔ tareas 10 a 12 implementadas y verificadas localmente (90 `bun test` y 20 e2e en verde); **los PR están pendientes de push** y la verificación del CI en `main` también. Las issues del ciclo 3 llevan la etiqueta `ciclo-3`; su numeración se desplazó porque el PR #10 ocupó el número 10.

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 10 | Diegoalevq (Spec) | `docs/11-cr-01-recurrentes` | [#11](https://github.com/liversay/Sistema_de_reservas/issues/11) | CR-01 en las specs: RF-15/16, RN-12/13, CA-15…18, api, modelo, plan, ADR-005 |
| 11 | liversay (Dev) | `feat/12-series` | [#12](https://github.com/liversay/Sistema_de_reservas/issues/12) | Implementar reservas recurrentes semanales (API, `seriesId`, índice, web) |
| 12 | aaronbatistaa (QA) | `test/13-series-cierre` | [#13](https://github.com/liversay/Sistema_de_reservas/issues/13) | Pruebas de la serie, evidencia en `docs/testing.md` y cierre |

### Flujo del cambio CR-01

1. **Cambio solicitado** (2026-11-17): "Un equipo quiere reservar la misma cancha todos los jueves a las 20:00 durante varias semanas." → issue #11.
2. **Actualizar la spec:** RF-15/RF-16 en `requirements.md`, RN-12/RN-13 en `business-rules.md`.
3. **Actualizar los criterios de aceptación:** CA-15…CA-18 y su prueba prevista.
4. **Actualizar contratos y plan:** `api.md`, `data-model.md` (`bookings.seriesId?`, índice), este plan, ADR-005 y CHANGELOG.
5. **Código** (#12) → **pruebas** (#13) → **resultados** en `docs/testing.md` («Evidencia CR-01»).

Los ciclos 1–2 no dejaron nada preparado para series (sin `seriesId`), para que el cambio sea real.
Los cambios de este ciclo están marcados con `CR-01` en cada documento.

## Ciclo 4 (cambio de requerimiento CR-02, en curso)

Estado: spec en revisión (tarea 13); el código y las pruebas siguen pendientes. Las issues del ciclo 4 llevan la etiqueta `ciclo-4`. Las ramas de las tareas 14 a 17 son las previstas.

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 13 | liversay (Spec) | `docs/28-cr-02` | [#28](https://github.com/liversay/Sistema_de_reservas/issues/28) | CR-02 en las specs: RF-17…RF-22, RN-14…RN-16, CA-19…CA-25, api, modelo, plan, ADR-006 |
| 14 | aaronbatistaa (Dev) | `feat/29-api-cr-02` | [#29](https://github.com/liversay/Sistema_de_reservas/issues/29) | API: reserva sin sesión, descuento, horizonte, `settings/loyalty`, `calendar`, `payments/summary`, método `yappy` |
| 15 | aaronbatistaa (Dev) | `feat/30-web-cliente-cr-02` | [#30](https://github.com/liversay/Sistema_de_reservas/issues/30) | Web cliente: horas en 12 h, 31 días, sin horas pasadas, reservar sin cuenta, club de socios, login sin pegarse al encabezado |
| 16 | aaronbatistaa (Dev) | `feat/31-backoffice-tablero-cr-02` | [#31](https://github.com/liversay/Sistema_de_reservas/issues/31) | Backoffice: tablero Reservas/Pagos, tarjeta de detalle, indicadores, ajuste del % de socios |
| 17 | Diegoalevq (QA) | `test/32-cr-02` | [#32](https://github.com/liversay/Sistema_de_reservas/issues/32) | e2e actualizados y `cr02.e2e.ts` (CA-19…CA-25), evidencia en `docs/testing.md`, README y CHANGELOG |

### Flujo del cambio CR-02

1. **Cambio solicitado** (2026-11-17): reservar sin cuenta (nombre y teléfono), login como club de socios con % de descuento configurable, horizonte de 1 mes, horas en 12 h, sin reservar horas pasadas, y backoffice con tablero calendario (Reservas | Pagos con indicadores) → issue #28.
2. **Actualizar la spec:** RF-17…RF-22 en `requirements.md`, RN-14…RN-16 (y RN-05 también en la UI) en `business-rules.md`. Reglas anteriores que cambian (RF-04 «autenticado», «la cuenta es necesaria para reservar», CA-09 «reservar sin sesión → 401», método de pago sin `yappy`) quedan marcadas como modificadas por CR-02 en lugar de borrarse.
3. **Actualizar los criterios de aceptación:** CA-19…CA-25 y su prueba prevista.
4. **Actualizar contratos y plan:** `api.md` (sesión opcional con `guest`, `settings/loyalty`, `calendar`, `payments/summary`, `yappy`, horizonte), `data-model.md` (`settings`, `basePrice`, `discountPct`), este plan, ADR-006 y CHANGELOG.
5. **Código** (#29, #30, #31) → **pruebas** (#32) → **resultados** en `docs/testing.md` («Evidencia CR-02»).

Decisiones tomadas con el usuario el 2026-11-17: el descuento de socios es un % configurable en el backoffice (por defecto 10, rango 0–50) que solo se aplica a reservas hechas con sesión; los métodos de pago son efectivo, transferencia, tarjeta y yappy; reservar sin cuenta exige nombre y teléfono; el horizonte de 30 días aplica a cada ocurrencia de una serie; las reservas canceladas se listan bajo el tablero del admin y no ocupan bloques.
Los cambios de este ciclo están marcados con `CR-02` en cada documento.

## Trazabilidad

RF → RN → CA → prueba. La tabla CA → prueba vive en `docs/testing.md`.

| Ciclo | CA cubiertos |
|---|---|
| 1 ✔ | CA-01, CA-03 (cálculo), CA-04, CA-05, CA-06 a nivel de dominio y base de datos |
| 2 | CA-01…CA-14 en API y e2e |
| 3 *(CR-01)* | CA-15…CA-18 en API y e2e ✔ |
| 4 *(CR-02)* | CA-19…CA-25 en API y e2e (pendiente) |
