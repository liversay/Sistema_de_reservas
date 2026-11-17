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
- **Consecuencias:** `bookings.seriesId?` opcional (sin migración) e índice `(seriesId)`; cuatro endpoints nuevos; hasta 8 reservas por transacción; el límite de 8 acota su tamaño *(CR-02, ADR-006: el horizonte de 30 días lo reduce en la práctica a 5 ocurrencias)*; el cliente debe elegir otra hora si una fecha está tomada, sin ofrecer saltos de fecha en este ciclo.

## ADR-006 Reserva sin cuenta, club de socios y horizonte de 30 días (CR-02)

- **Estado:** aceptada (2026-11-17), cambio de requerimiento CR-02 (#28). Modifica la regla «el cliente crea una cuenta para reservar» (ver ADR-004: la sesión sigue siendo la cookie `sid`).
- **Contexto:** el usuario quiere que reservar no requiera cuenta, que el login sea para socios de fidelidad con descuento, que solo se reserve hasta con un mes de antelación y que el backoffice muestre un tablero calendario con pagos e indicadores. Hasta el ciclo 3 la cuenta era obligatoria para reservar y el descuento no existía.
- **Alternativas:** (2) descuento fijo en el código: no se puede ajustar sin desplegar y el usuario pidió configurarlo; (3) código de cupón por reserva: más fricción para el cliente y más piezas (colección y validación) para el alcance; (4) sesión obligatoria con registro «invisible» para el invitado: crea cuentas que nadie pidió y mezcla datos; (5) horizonte solo en la UI: la API aceptaría fechas lejanas y las series podrían saltárselo.
- **Decisión:** `POST /api/bookings` y `/series` leen la sesión de forma opcional: con sesión de cliente se usa el usuario y se aplica el descuento; sin sesión se exige `guest { name, phone }` y `discountPct = 0` (RN-15, RN-16). El % vive en `settings/loyalty` (entero 0–50, por defecto 10, *provisional*) y cada reserva copia `basePrice`, `discountPct` y `price = round2(basePrice·(1−pct/100))`, por lo que cambiarlo no altera lo ya reservado (RN-10). El horizonte de 30 días (RN-14) se valida en el servidor, en `ruleViolation`, para cada ocurrencia de una serie (todo-o-nada, ADR-005). Métodos de pago: efectivo, transferencia, tarjeta, yappy. El tablero del backoffice usa dos endpoints de lectura agregada (`calendar`, `payments/summary`) para no cargar todas las reservas en el navegador; las canceladas se listan bajo el tablero porque no ocupan bloques. Las horas se muestran en 12 h solo en la UI; la API conserva `HH:MM`.
- **Consecuencias:** la API de reservas deja de devolver `401` sin sesión (queda en `mine`/`cancel`); el invitado no puede ver ni cancelar sus reservas desde la web (solo con cuenta o por el admin); sin verificación del teléfono, cualquiera puede reservar con datos falsos, lo que se asume por alcance y se mitiga con la cancelación del admin; una sesión de admin en estas rutas cuenta como sin sesión; `bookings` gana `basePrice?`/`discountPct?` opcionales (sin migración) y nace la colección `settings`; el 10 % es un valor provisional editable en el backoffice.
