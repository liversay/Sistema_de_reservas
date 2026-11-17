# Decisiones (ADR)

## ADR-001 Stack: TypeScript, React, Bun, Hono, MongoDB local

- **Estado:** aceptada (2026-11-16)
- **Contexto:** el PDF permite cualquier stack y exige mencionarlo en `architecture.md`. Entrega en un día; el equipo prioriza un solo lenguaje y pruebas rápidas. Esta máquina no tiene Docker.
- **Decisión:** TypeScript en todo el repo, Bun (runtime, workspaces y `bun test`), Hono para la API, React + Vite para la web, Zod compartido, MongoDB con el `mongod` local como replica set de un nodo.
- **Consecuencias:** esquemas y reglas puras compartidos entre API y web; el replica set es necesario para transacciones; CI debe instalar binarios de MongoDB.

## ADR-002 Anti-doble-reserva con `slot_locks` e índice único

- **Estado:** aceptada (2026-11-16)
- **Contexto:** RN-01 y RN-02 (incluida la cancha divisible) no pueden depender de un "buscar y luego insertar", que tiene carreras entre peticiones simultáneas.
- **Alternativas:** (2) consulta de solapamiento + insert, requeriría un lock manual; (3) turnos pre-generados, rígido con duraciones variables y cancha divisible.
- **Decisión:** cada reserva escribe un documento `slot_locks` por bloque de 30 min y por espacio físico, con índice único `(spaceId, date, slot)`, todo en una transacción. La completa de fútbol bloquea ambos espacios. `E11000` → `409`.
- **Consecuencias:** la regla crítica la garantiza MongoDB; más documentos por reserva; requiere replica set local.

## ADR-003 Ejecución por agente de IA con identidades por rol

- **Estado:** aceptada (2026-11-16)
- **Contexto:** hay tres integrantes con roles rotativos, entrega en un día, y `gh` solo tiene sesión de liversay.
- **Decisión:** un agente de IA (Claude Code) ejecuta las tareas desde los tres clones, usando en cada commit la identidad del integrante con el rol de ese ciclo. Los PRs e issues se crean desde la cuenta liversay; las revisiones de otros roles se registran como comentarios firmados, indicando rol y que fueron asistidas por IA ("revisión equivalente"). Todo uso de IA se declara en `docs/ai-log.md`.
- **Consecuencias:** transparencia sobre quién ejecuta; los integrantes deben leer código y specs antes de presentar, porque el presentador se elige al azar.
