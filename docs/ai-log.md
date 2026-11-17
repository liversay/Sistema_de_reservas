# Registro de uso de IA

Un agente de IA (Claude Code, modelo Claude de Anthropic) ejecuta las tareas usando la identidad de
cada integrante según su rol en el ciclo (ver ADR-003). Este registro lista cada uso de IA.

| Fecha | Actividad | IA utilizada | Solicitud | Resultado | Decisión |
|---|---|---|---|---|---|
| 2026-11-16 | Exploración visual: 3 direcciones de diseño en un canvas de diseño | Claude (canvas de diseño) | Proponer tres direcciones visuales (A, B, C) para cliente y backoffice del sistema de reservas | Tres direcciones con pantallas de disponibilidad y backoffice | Se elige la dirección C con la cuadrícula canchas × horas de la A |
| 2026-11-16 | Brainstorming y documento de diseño | Claude Code (Claude) | Explorar el problema, enfoques anti-doble-reserva, reglas y roles; redactar el diseño | `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md` con RN-01…RN-11, precios, API y ciclos | Se elige el enfoque 1 (bloques con índice único); el usuario aprueba el diseño |
| 2026-11-16 | Revisión de consistencia del diseño (builder-check) | Claude Code (Claude) | Revisar el diseño buscando huecos y contradicciones | Observaciones sobre el diseño | Se ajusta el diseño antes de planificar |
| 2026-11-16 | Plan de implementación | Claude Code (Claude) | Convertir el diseño aprobado en tareas por ciclo y rol | `docs/superpowers/plans/2026-11-16-reservas-canchas.md` (tareas 0–12) | Se adopta el plan; se ejecuta con identidades por rol |
| 2026-11-16 | Tarea 1: ODD + especificaciones (ciclo 1) | Claude Code (Claude), con identidad liversay (Spec) | Escribir `specs/` y `docs/` desde el diseño aprobado; crear issues y PR | `outcomes`, `requirements`, `business-rules`, `acceptance-criteria` (CA-01…CA-14), `architecture`, `data-model`, `api`, `implementation-plan`, ADR-001…003 | Pendiente de revisión QA (Diegoalevq) y merge |
| 2026-11-16 | Tarea 2: monorepo, MongoDB local y reglas puras (ciclo 1) | Claude Code (Claude), con identidad aaronbatistaa (Arquitectura/Desarrollo) | Crear workspace Bun, `@canchas/shared` (tiempo, precios, reglas, esquemas Zod) con TDD y scripts `db:start`/`db:stop` para MongoDB local con replica set | Paquete compartido con 22 tests unitarios en verde; MongoDB `rs0` en el puerto 27027, idempotente | Pendiente de revisión (Spec) contra `data-model.md` y merge |
| 2026-11-16 | Tarea 3: base de datos, disponibilidad y creación de reservas (ciclo 1) | Claude Code (Claude), con identidad aaronbatistaa (Desarrollo) | Implementar `db`, `seed`, errores, `getAvailability`, `createBooking`/`cancelBooking` con transacción e índice único en `slot_locks` (TDD) | Módulo `src/api` con 17 pruebas de integración en verde (incluye concurrencia: 8 intentos, 1 gana), script `db:seed` | Pendiente de revisión QA (Diegoalevq) y merge |
