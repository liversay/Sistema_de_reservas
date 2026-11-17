# Pruebas

Estrategia (ver `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md` §9):

- **Unitarias (`bun test`):** bloques, precios, horario de atención, validaciones Zod.
- **Reglas críticas e integración (`bun test` + `mongod` local, BD de prueba):** RN-01 a RN-08; doble reserva obligatoria (misma cancha, mitad vs completa, 10 peticiones concurrentes → 1 éxito).
- **Aceptación (Playwright, `tests/e2e/*.e2e.ts`):** cada prueba nombra los CA que cubre.
- **CI:** GitHub Actions corre unitarias e integración en cada PR; Playwright corre localmente y su resultado se adjunta al PR.

## Tabla CA → prueba

Se completa a medida que se escriben las pruebas (tareas 4 y 9).

| CA | Prueba | Tipo | Estado |
|---|---|---|---|
| CA-01 | — | integración / e2e | pendiente |
| CA-02 | — | e2e | pendiente |
| CA-03 | — | unitaria / e2e | pendiente |
| CA-04 | — | integración / e2e | pendiente |
| CA-05 | — | integración | pendiente |
| CA-06 | — | integración | pendiente |
| CA-07 | — | integración / e2e | pendiente |
| CA-08 | — | unitaria / integración | pendiente |
| CA-09 | — | integración / e2e | pendiente |
| CA-10 | — | integración / e2e | pendiente |
| CA-11 | — | integración | pendiente |
| CA-12 | — | integración / e2e | pendiente |
| CA-13 | — | integración | pendiente |
| CA-14 | — | integración / e2e | pendiente |
