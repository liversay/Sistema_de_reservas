# Sistema de Reservas de Canchas — Documento de diseño

Fecha: 2026-11-16 · Estado: aprobado (2026-11-16)
Repositorio: `git@github.com:liversay/Sistema_de_reservas.git`

## 1. Intención y por qué

Proyecto 2 de Tópicos Especiales II (Prof. Regis Rivera): un sistema de reservas especializado,
construido siguiendo **ODD → SDD → código → pruebas → valor al usuario**. El profesor evalúa el
**proceso** (especificaciones, trazabilidad, Git, pruebas, uso documentado de IA, manejo de un
cambio de requerimiento), no la herramienta. La opción elegida del PDF es **Cancha deportiva**.

### ODD (propuesta, a validar en `specs/outcomes.md`)

- **Problema:** el complejo coordina reservas por teléfono/WhatsApp. El cliente no sabe qué está
  libre sin preguntar, y la cancha de fútbol que se alquila completa o por mitades genera cruces
  (alguien reserva la media cancha mientras otro ya tenía la completa). El cobro se hace después
  de jugar y no queda registro claro de quién debe.
- **Outcome para el cliente:** ver por sí mismo qué canchas y horarios están libres y reservar en
  menos de un minuto, sin intervención del personal.
- **Outcome para el administrador:** cero reservas superpuestas; ver el día de un vistazo;
  registrar cobros post-juego y saber qué está pendiente.

## 2. Metas, no-metas, anti-metas

**Metas**
- Cliente: ver disponibilidad por día como cuadrícula canchas × horas, elegir duración, reservar,
  ver y cancelar sus reservas.
- Backoffice: administrar canchas, horarios de atención, precios, reservas y pagos.
- Regla anti-doble-reserva garantizada por la base de datos, con prueba automatizada obligatoria.
- Entregables del PDF: estructura `specs/` y `docs/`, issues, ramas, PRs, commits identificables
  por integrante, pruebas automatizadas, README, `ai-log.md`, ciclo de cambio de requerimiento.

**No-metas**
- Pago en línea (el pago es presencial, después de jugar; solo se registra en el backoffice).
- Notificaciones por correo/SMS/WhatsApp, multi-sede, app nativa, despliegue en la nube.

**Anti-metas (fallaría aunque "funcione")**
- Que dos reservas se crucen en el mismo espacio físico, por concurrencia o por mitades.
- Que el cliente vea precios distintos a los que se le registran.
- Que se pueda registrar un pago de una reserva que aún no se jugó.
- Código sin especificación ni prueba que lo respalde (el proceso es lo evaluado).

## 3. Restricciones

- Stack: **TypeScript, React, Bun, Hono, MongoDB**. **Sin Docker**: MongoDB corre con el `mongod`
  local (v8) como replica set de un nodo (necesario para transacciones).
- Tres cuentas GitHub ya configuradas con SSH en esta máquina, un clon por cuenta en
  `~/proyectos/Sistema_de_reservas-<usuario>` con `user.name`/`user.email` locales.
- `gh` solo tiene sesión de **liversay**: los PRs/issues se crean desde esa cuenta; las revisiones
  de otros integrantes se registran como comentario de revisión firmado ("revisión equivalente",
  aceptada por el PDF), salvo que los otros integrantes inicien sesión en `gh`.
- Cada implementación se prueba con Playwright antes de darse por terminada.
- **Entrega: 2026-11-17 (mañana).** Los tres ciclos se ejecutan seguidos en una sola jornada.
- **Quién ejecuta:** un agente de IA (Claude Code) ejecuta todas las tareas desde los tres clones,
  usando en cada commit la identidad del integrante que tiene ese rol en el ciclo. `ai-log.md` lo
  declara así, sin ocultarlo; las revisiones de PR se registran como comentarios que indican qué
  rol revisó y que la revisión fue asistida por IA. Los integrantes deben leer el código y las specs
  antes de presentar, porque el presentador se elige al azar.

## 4. Enfoques considerados

| Enfoque | Cómo funciona | Contras |
|---|---|---|
| **1. Bloques ocupados con índice único (elegido)** | Cada reserva escribe un documento por bloque de 30 min y por espacio físico que ocupa; índice único `(spaceId, date, slot)`; todo en una transacción. | Requiere replica set local; más documentos por reserva. |
| 2. Consulta de solapamiento + insert | Busca reservas que se crucen y luego inserta. | Carrera entre dos peticiones simultáneas; requeriría un lock manual. |
| 3. Turnos pre-generados | El admin genera turnos; reservar marca uno como tomado. | Rígido con duraciones variables y con la cancha divisible. |

Elegido el **1** por el usuario: la regla crítica la garantiza MongoDB, no solo el código.

## 5. Dominio y reglas de negocio

### Espacios físicos y unidades reservables

- **Espacio (space):** la superficie física que no puede usarse dos veces al mismo tiempo.
  Ej.: `futbol-media-a`, `futbol-media-b`, `padel-1`, `basquet-1`.
- **Cancha (court) / unidad reservable:** lo que el cliente elige; ocupa uno o más espacios.

| Cancha | Deporte | Espacios que ocupa | Formato |
|---|---|---|---|
| Fútbol · Media A | fútbol | media-a | 5vs5 |
| Fútbol · Media B | fútbol | media-b | 5vs5 |
| Fútbol · Completa | fútbol | media-a + media-b | 7vs7 |
| Pádel 1 | pádel | padel-1 | — |
| Básquet 1 | básquet | basquet-1 | — |

El admin puede crear más canchas y espacios (p. ej. Pádel 2) desde el backoffice.

### Precios (tabla por cancha y duración, en USD)

| Cancha | 1 h | 1 h 30 | 2 h |
|---|---|---|---|
| Media cancha 5vs5 | 50 | 75 | 95 |
| Cancha completa 7vs7 | 95 | 140 | 180 |
| Pádel *(provisional)* | 20 | 30 | 40 |
| Básquet *(provisional)* | 30 | 45 | 60 |

Pádel y básquet son valores de ejemplo, editables en el backoffice. El precio se copia a la
reserva al crearla (un cambio de tarifa no altera reservas existentes).

### Reglas (borrador de `specs/business-rules.md`)

- **RN-01 Sin doble reserva:** un espacio no puede tener dos reservas activas que se solapen en
  ningún bloque de 30 min.
- **RN-02 Cancha divisible:** reservar la completa ocupa ambas mitades; si cualquiera de las
  mitades está ocupada en un bloque, la completa no está disponible en ese bloque.
- **RN-03 Duraciones:** solo 60, 90 o 120 minutos; inicio en múltiplos de 30 min.
- **RN-04 Horario de atención:** la reserva debe caber completa dentro del horario de atención de
  la cancha para ese día de la semana. Por defecto *(provisional)*: L–V 16:00–23:00, S–D 08:00–23:00.
- **RN-05 Sin pasado:** no se reserva un turno que ya empezó.
- **RN-06 Cancelación:** el cliente cancela su reserva antes de que empiece; el admin puede
  cancelar cualquiera. Cancelar libera los bloques.
- **RN-07 Pago post-juego:** el pago solo puede registrarse cuando la reserva terminó; registra
  monto, método (efectivo, transferencia, tarjeta) y quién cobró.
- **RN-08 Cancha inactiva:** una cancha en mantenimiento no aparece disponible; no se pueden crear
  reservas nuevas en ella.
- **RN-09 Reserva por el admin:** el admin crea reservas para clientes sin cuenta (nombre y
  teléfono obligatorios), sujetas a las mismas reglas RN-01 a RN-05 y RN-08.
- **RN-10 Cambios de configuración** *(decisión del diseñador)*: cambiar precios, horario o poner
  en mantenimiento afecta solo a reservas nuevas; las existentes se conservan y el admin las
  cancela a mano si hace falta. Una cancha con reservas no se borra, solo se desactiva.
- **RN-11 No se presentó** *(decisión del diseñador)*: el admin puede marcar una reserva jugada
  como "no se presentó"; sale de "por cobrar" y no admite pago. El monto del pago se prellena con
  el precio y el admin puede ajustarlo (descuento); no hay pagos parciales.

### Estados de una reserva

`confirmada` → (`cancelada` | `no_show`) · `confirmada` + hora fin pasada → se muestra como
**jugada** (derivado del reloj, no un estado guardado) · pago: `pendiente` → `pagado`.
"Por cobrar" = jugada, no cancelada ni `no_show`, y pago pendiente.

### Usuarios

*Decisión del diseñador:* el cliente crea una cuenta (nombre, email, teléfono, contraseña) para
reservar y ver "Mis reservas". El admin es un rol sembrado al iniciar. Sesión con cookie firmada
(httpOnly). Esto da material a las "validaciones de usuario" que pide el PDF.

## 6. Arquitectura

- **Monorepo Bun workspaces**, siguiendo la estructura de referencia del PDF:
  ```
  README.md  specs/  docs/  src/api (Hono)  src/web (React + Vite)  src/shared  tests/
  ```
- `src/shared`: esquemas Zod, cálculo de bloques, precios y reglas puras (usados por API y web).
- `src/api`: Hono sobre Bun, driver oficial `mongodb`. Transacción para crear/cancelar reservas.
- `src/web`: React + Vite + React Router; estilo de la dirección C (verde césped `#0F3D2A`,
  amarillo `#F2B705`, Bricolage Grotesque + Manrope).
- **MongoDB local sin Docker:** script `bun run db:start` que lanza `mongod --replSet rs0` con datos
  en `./.data/db` e inicializa el replica set; `db:seed` carga canchas, precios, horarios y admin.

### Colecciones

- `spaces` { _id, name }
- `courts` { _id, name, sport, format, spaceIds[], active, prices {60,90,120}, schedule [{weekday, open, close, closed}] }
- `bookings` { _id, courtId, userId? | guest {name, phone}, createdBy (client|admin), date (YYYY-MM-DD), startSlot, durationMin, spaceIds[], price, status, payment {status, amount, method, paidAt, paidBy}, createdAt }
- `slot_locks` { spaceId, date, slot, bookingId } — **índice único `(spaceId, date, slot)`**
- `users` { _id, name, email (único), phone, passwordHash, role }

Crear reserva = transacción que inserta la reserva y sus `slot_locks`; un `E11000` se traduce en
`409 Conflicto: el horario ya fue tomado`. Cancelar = transacción que marca cancelada y borra sus locks.

### API (borrador de `specs/api.md`)

- `GET /api/availability?date=` → canchas activas con el estado de cada bloque.
- `POST /api/bookings` · `GET /api/bookings/mine` · `POST /api/bookings/:id/cancel`
- `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- Admin: `GET /api/admin/bookings?date=` · `POST /api/admin/bookings` (cliente sin cuenta) ·
  `POST /api/admin/bookings/:id/payment` · `POST /api/admin/bookings/:id/no-show` ·
  `POST /api/admin/bookings/:id/cancel` ·
  `CRUD /api/admin/courts` (incluye precios, horario, activo) · `GET /api/admin/payments?status=pending`

## 7. Interfaz

- **Cliente — Disponibilidad:** estilo de la dirección C con la **cuadrícula canchas × horas de la
  dirección A**: filas = canchas, columnas = bloques de 30 min, selector de duración (1 h · 1 h 30 ·
  2 h), tira de días, filtro por deporte; panel/barra "Tu reserva" con precio. En móvil la cuadrícula
  se desplaza horizontalmente con la columna de canchas fija.
- **Cliente — Mis reservas, Ingresar / Crear cuenta.**
- **Backoffice:** Reservas del día (tabla con estado y pago), Canchas y horarios (como C-Backoffice:
  tarjetas de cancha, horario semanal, precios por duración, activa/mantenimiento), Pagos (por
  cobrar y cobrados, registrar pago).
- Referencia visual: canvas https://claude.ai/artifact/TtWmmMdn8Cr8ApqCYvPXi7 (C + cuadrícula de A).

## 8. Proceso (lo que el profesor evalúa)

### Ciclos y rotación de roles

| Ciclo | Alcance | Product/Spec | Arquitectura/Dev | QA/DevOps |
|---|---|---|---|---|
| 1 | ODD + specs completas, monorepo, DB local, modelo, disponibilidad + regla anti-choque | liversay | aaronbatistaa | Diegoalevq |
| 2 | Reserva del cliente, cuentas, Mis reservas, backoffice (reservas, canchas, horarios, precios) | aaronbatistaa | Diegoalevq | liversay |
| 3 | **Cambio de requerimiento: reservas recurrentes semanales**, pagos, README, cierre | Diegoalevq | liversay | aaronbatistaa |

- Cada tarea = issue → rama `tipo/numero-descripcion` → commits desde el clon del autor del rol →
  PR hacia `main` → revisión por otro integrante → merge.
- Los commits del rol Spec viven en `specs/`, los de Dev en `src/`, los de QA en `tests/`, CI y
  `docs/testing.md`. `docs/ai-log.md` registra cada uso de IA (actividad, IA, solicitud, resultado,
  decisión); `docs/decisions.md` registra decisiones como esta.

### Cambio de requerimiento (ciclo 3)

"Un equipo quiere reservar la misma cancha todos los jueves a las 20:00 durante N semanas."
Los ciclos 1–2 **no** dejan nada preparado para series (sin `seriesId`), para que el cambio sea
real. Reglas propuestas para la spec del ciclo 3 *(decisión del diseñador)*: la crea el cliente o
el admin, de 2 a 8 semanas; se valida todo-o-nada (si una fecha choca, no se crea ninguna y se
indica cuál choca); cada ocurrencia es una reserva propia que se cancela y se cobra por separado;
existe la opción de cancelar las ocurrencias futuras de la serie.
Se documenta el ciclo completo: issue del cambio → actualizar `requirements.md`, `business-rules.md`
(regla de conflicto para series: todo-o-nada) → `acceptance-criteria.md` → `implementation-plan.md`
→ código → pruebas → evidencia en `docs/testing.md`.

## 9. Pruebas

- **Unitarias (bun test):** bloques, precios, horario de atención, validaciones Zod.
- **Reglas críticas e integración (bun test + mongod local, BD de prueba):** RN-01 a RN-08;
  **doble reserva obligatoria**: misma cancha, mitad vs completa, y 10 peticiones concurrentes al
  mismo turno → exactamente 1 éxito.
- **Validaciones de usuario:** registro/login (email, teléfono, contraseña), permisos admin.
- **Aceptación (Playwright):** pruebas de los flujos principales; cada prueba nombra los criterios
  (CA-xx) que cubre, y `docs/testing.md` lleva la tabla CA → prueba. Por la entrega de mañana,
  se priorizan los CA de reservar, choque, backoffice de cobro y la serie recurrente.
- **CI (GitHub Actions):** instala binarios de MongoDB (sin Docker en esta máquina) y corre
  unitarias e integración en cada PR; Playwright corre localmente y su resultado se adjunta en el PR.

## 10. Queda al criterio del implementador

Nombres internos, librerías menores (hash de contraseña, cliente HTTP), organización de
componentes React, paginación, mensajes de error exactos, texto de los specs dentro de lo aquí fijado.
