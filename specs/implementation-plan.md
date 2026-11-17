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

## Ciclo 1

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 1 | liversay (Spec) | `docs/1-odd-sdd` | [#1](https://github.com/liversay/Sistema_de_reservas/issues/1) | ODD, specs, decisiones, ai-log |
| 2 | aaronbatistaa (Dev) | `feat/2-monorepo` | [#2](https://github.com/liversay/Sistema_de_reservas/issues/2) | Monorepo, MongoDB local, reglas puras en `src/shared` |
| 3 | aaronbatistaa (Dev) | `feat/3-reservas-core` | [#3](https://github.com/liversay/Sistema_de_reservas/issues/3) | Base de datos, disponibilidad, creación de reservas, slot_locks |
| 4 | Diegoalevq (QA) | `test/4-doble-reserva-ci` | [#4](https://github.com/liversay/Sistema_de_reservas/issues/4) | Suite de doble reserva (CA-05, CA-06) y CI |

## Ciclo 2

| Tarea | Responsable (rol) | Rama | Issue | Alcance |
|---|---|---|---|---|
| 5 | aaronbatistaa (Spec) | `docs/5-specs-ciclo-2` | [#5](https://github.com/liversay/Sistema_de_reservas/issues/5) | Afinar specs del ciclo 2 |
| 6 | Diegoalevq (Dev) | `feat/6-api` | [#6](https://github.com/liversay/Sistema_de_reservas/issues/6) | API HTTP: auth, reservas y admin |
| 7 | Diegoalevq (Dev) | `feat/7-web-cliente` | [#7](https://github.com/liversay/Sistema_de_reservas/issues/7) | Web cliente |
| 8 | Diegoalevq (Dev) | `feat/8-backoffice` | [#8](https://github.com/liversay/Sistema_de_reservas/issues/8) | Web backoffice |
| 9 | liversay (QA) | `test/9-e2e` | [#9](https://github.com/liversay/Sistema_de_reservas/issues/9) | Pruebas de aceptación e2e (Playwright) |

## Ciclo 3 (cambio de requerimiento)

Las issues del ciclo 3 se crean al iniciarlo (su número se registra aquí entonces).

| Tarea | Responsable (rol) | Rama | Alcance |
|---|---|---|---|
| 10 | Diegoalevq (Spec) | `docs/10-cr-01-recurrentes` | CR-01 en las specs: requisitos, reglas (conflicto todo-o-nada), CA, plan |
| 11 | liversay (Dev) | `feat/11-series` | Implementar reservas recurrentes semanales |
| 12 | aaronbatistaa (QA) | `test/12-series-cierre` | Pruebas de la serie, evidencia en `docs/testing.md` y cierre |

CR-01: "Un equipo quiere reservar la misma cancha todos los jueves a las 20:00 durante N semanas."
Los ciclos 1–2 no dejan nada preparado para series (sin `seriesId`), para que el cambio sea real.

## Trazabilidad

RF → RN → CA → prueba. La tabla CA → prueba vive en `docs/testing.md`.

| Ciclo | CA cubiertos |
|---|---|
| 1 | CA-01, CA-03 (cálculo), CA-04, CA-05, CA-06 a nivel de dominio y base de datos |
| 2 | CA-01…CA-14 en API y e2e |
