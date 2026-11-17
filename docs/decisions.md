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

## ADR-004 Sesión con cookie firmada

- **Estado:** aceptada (2026-11-16)
- **Contexto:** el ciclo 2 añade cuentas de cliente y rol admin (RF-07, RF-08). La web y la API se sirven desde el mismo origen y no hay integraciones de terceros; se necesita algo simple de probar con `createApp`.
- **Alternativas:** (2) JWT en `Authorization` guardado por la web en `localStorage`, expuesto a XSS y sin cierre de sesión real; (3) sesiones en la base de datos con colección `sessions`, más piezas para un alcance de un día.
- **Decisión:** cookie `sid` firmada con un `secret` (HMAC, `hono/cookie`) que contiene solo el `userId`; `httpOnly`, `SameSite=Lax`, `path=/`. En cada petición se carga el usuario y su rol desde `users`, de modo que el rol no viaja en la cookie. Contraseñas con `Bun.password` (argon2id). `logout` borra la cookie. Errores: `401` sin sesión o cookie inválida, `403` sin rol admin.
- **Consecuencias:** sin estado en el servidor ni colección extra; no se puede invalidar una sesión concreta antes de que el usuario sea borrado (aceptable por alcance); `secret` entra por `createApp({ secret })` y se lee de una variable de entorno en producción; `SameSite=Lax` mitiga CSRF en métodos que modifican datos; el flag `secure` se activa tras HTTPS, fuera del alcance de este entregable.
- **Limitaciones:** no hay revocación en el servidor; el cierre de sesión solo borra la cookie. La sesión caduca a los 7 días (`userId.issuedAtMs` firmado, `maxAge` 7 días); `secure` se activa con `NODE_ENV=production`.

## ADR-005 Series semanales: todo-o-nada con reservas independientes (CR-01)

- **Estado:** aceptada (2026-11-17), cambio de requerimiento CR-01 (#11)
- **Contexto:** un equipo quiere la misma cancha todos los jueves a las 20:00 durante varias semanas. Los ciclos 1 y 2 no dejaron `seriesId` ni nada preparado para series.
- **Alternativas:** (2) crear las ocurrencias que se pueda y avisar de las que chocan (series parciales): deja al equipo con una serie incompleta y sin forma clara de reintentar; (3) un documento de serie único con una lista de fechas y un solo bloqueo: rompe el pago, la cancelación y el no-show por ocurrencia, y rompe `slot_locks` por reserva.
- **Decisión:** una serie se crea **todo-o-nada** en una sola transacción (RN-12): de 2 a 8 ocurrencias en `fecha + 7·k`; si una choca (`409`) o incumple una regla (`422`), no se crea ninguna y el error nombra la fecha. Cada ocurrencia es una reserva normal con `seriesId` compartido (RN-13), con sus propios `slot_locks`, precio, cancelación y pago. Se añade "cancelar las próximas" (solo las que no han empezado). Se reutiliza el índice único de `slot_locks` (ADR-002), por lo que la garantía anti-choque no cambia.
- **Consecuencias:** `bookings.seriesId?` opcional (sin migración) e índice `(seriesId)`; cuatro endpoints nuevos; hasta 8 reservas por transacción; el límite de 8 acota su tamaño; el cliente debe elegir otra hora si una fecha está tomada, sin ofrecer saltos de fecha en este ciclo.
