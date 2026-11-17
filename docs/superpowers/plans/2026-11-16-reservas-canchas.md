# Sistema de Reservas de Canchas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web de reservas de canchas (fútbol divisible, pádel, básquet) con backoffice, construida en 3 ciclos con rotación de roles y evidencia ODD→SDD→código→pruebas.

**Architecture:** Monorepo Bun workspaces: `src/shared` (reglas puras + Zod), `src/api` (Hono + driver `mongodb`), `src/web` (React + Vite). La regla anti-choque vive en MongoDB: colección `slot_locks` con índice único `(spaceId, date, slot)`, escrita en la misma transacción que la reserva.

**Tech Stack:** Bun 1.3, TypeScript, Hono, mongodb (driver oficial), Zod, React 18 + Vite + React Router, bun test, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md`

## Global Constraints

- Sin Docker. MongoDB local: `mongod --replSet rs0 --port 27027 --dbpath ./.data/db` (puerto 27027 para no chocar con otro mongod).
- Fechas `YYYY-MM-DD`; horas `HH:MM`; bloque = índice de 30 min desde 00:00 (`"20:00"` → 40). Hora local del servidor; todo lo que depende del reloj recibe `now: Date` inyectable.
- Duraciones permitidas: 60, 90, 120. Precios (USD) — media 5vs5: 50/75/95 · completa 7vs7: 95/140/180 · pádel (provisional): 20/30/40 · básquet (provisional): 30/45/60.
- Horario por defecto (provisional): L–V 16:00–23:00, S–D 08:00–23:00.
- Espacios sembrados: `futbol-media-a`, `futbol-media-b`, `padel-1`, `basquet-1`. Canchas: Media A, Media B, Completa (ambas mitades), Pádel 1, Básquet 1.
- Errores HTTP: 400 entrada inválida (Zod), 401 sin sesión, 403 sin rol admin, 404 no existe, 409 choque/estado incompatible, 422 regla de negocio (horario, pasado, pago antes de jugar).
- Mensaje de choque exacto: `"Ese horario ya fue tomado. Elige otro."`
- UI en español, estilo dirección C: `#0F3D2A` verde, `#F2B705` amarillo, fondo `#F2F5F0`, Bricolage Grotesque (títulos) + Manrope (texto); cuadrícula canchas × bloques de la dirección A.
- Archivos de prueba: unit/integración `tests/**/*.test.ts` (bun test); e2e `tests/e2e/*.e2e.ts` (Playwright). Nunca `.spec.ts` (bun test los tomaría).
- Ningún campo de series (`seriesId`) antes de la Tarea 11.

## Flujo Git (todas las tareas)

Clones: `L=~/proyectos/Sistema_de_reservas-liversay`, `A=~/proyectos/Sistema_de_reservas-aaronbatistaa`, `D=~/proyectos/Sistema_de_reservas-Diegoalevq`. Repo: `liversay/Sistema_de_reservas`.

Para cada tarea, en el clon del responsable (`$C`):
1. `git -C $C checkout main && git -C $C pull --ff-only`
2. `git -C $C checkout -b <rama>` (rama indicada en la tarea; `#n` = issue)
3. Commits pequeños con mensaje convencional y `(#n)` al final.
4. `git -C $C push -u origin <rama>`
5. `gh pr create --repo liversay/Sistema_de_reservas --head <rama> --base main --title "..." --body "Closes #n ..."`
6. Revisión: `gh pr review <pr> --repo liversay/Sistema_de_reservas --comment --body "Revisión (<rol>, <usuario>, asistida por IA): ..."` desde el rol indicado.
7. `gh pr merge <pr> --repo liversay/Sistema_de_reservas --merge --delete-branch` (merge commit: conserva el autor de cada commit).
8. Entrada en `docs/ai-log.md` (actividad, IA, solicitud, resultado, decisión) dentro del mismo PR.

## Review Focus

- Turno que termina después del cierre (22:00 + 2 h con cierre 23:00) → 422, no se crea.
- Cancelar libera los bloques: volver a reservar el mismo turno funciona.
- Completa 20:00–21:00 cuando Media A tiene 20:30–21:30 → 409 (solapamiento parcial en una sola mitad).
- Pagar una reserva que no terminó → 422; pagar dos veces → 409; pagar una `no_show` → 409.
- Cancha inactiva: no aparece en disponibilidad y `POST /api/bookings` → 422; fecha `2026-13-40` u hora `20:15` → 400.

(Cada línea tiene su prueba en la tarea indicada: 3, 4 y 6.)

---

## Ciclo 1 — Spec: liversay · Dev: aaronbatistaa · QA: Diegoalevq

### Task 0: Acceso de colaboradores (prerrequisito, usuario)

- [ ] **Step 1:** Invitar a `aaronbatistaa` y `Diegoalevq` con permiso de escritura (`gh api -X PUT repos/liversay/Sistema_de_reservas/collaborators/<u> -f permission=push`), **previa confirmación del usuario**.
- [ ] **Step 2:** El usuario acepta las invitaciones en cada cuenta (web/correo).
- [ ] **Step 3:** Verificar: `gh api repos/liversay/Sistema_de_reservas/collaborators --jq '.[].login'` lista los tres.

### Task 1: ODD + SDD (liversay, rama `docs/1-odd-sdd`)

**Files:** Create `README.md`, `specs/{outcomes,requirements,business-rules,architecture,data-model,api,acceptance-criteria,implementation-plan}.md`, `docs/{ai-log,decisions,testing}.md`, `CHANGELOG.md`, `.gitignore` (`node_modules`, `.data`, `dist`, `test-results`, `playwright-report`); commit también el diseño y este plan (`docs/superpowers/`).

- [ ] **Step 1:** Commit inicial directo a `main` con `README.md` mínimo (título + una línea) para tener base; push.
- [ ] **Step 2:** Crear issues: `#1 ODD/SDD`, `#2 Monorepo y base de datos`, `#3 Disponibilidad y regla anti-choque`, `#4 Pruebas de doble reserva y CI`, `#5 Specs ciclo 2`, `#6 API de reservas, auth y admin`, `#7 Web cliente`, `#8 Web backoffice`, `#9 Pruebas e2e`, con etiquetas `ciclo-1|2`, `spec|dev|qa`.
- [ ] **Step 3:** Escribir specs desde el diseño. Contenido obligatorio:
  - `outcomes.md`: problema, outcome cliente, outcome admin, preguntas ODD (≥8) y métricas de éxito (p. ej. 0 choques, reservar < 1 min).
  - `requirements.md`: RF-01…RF-14 (disponibilidad, filtro deporte, duración, reservar, mis reservas, cancelar, registro, login, admin reservas del día, admin crea reserva invitado, cobrar, no-show, canchas/precios/horario, activar/desactivar) y RNF (sin Docker, stack, accesibilidad 44 px, contraste).
  - `business-rules.md`: RN-01…RN-11 tal cual el diseño.
  - `acceptance-criteria.md`: CA-01…CA-14 en Dado/Cuando/Entonces, cada uno citando RF/RN. Incluir obligatoriamente CA de doble reserva (misma cancha; mitad vs completa).
  - `architecture.md` (incluye sección "Libertad tecnológica" con el stack y por qué), `data-model.md`, `api.md` (endpoints del diseño + códigos de error de Global Constraints), `implementation-plan.md` (resumen de ciclos/tareas/roles de este plan con enlaces a issues).
  - `docs/decisions.md`: ADR-001 stack, ADR-002 slot_locks + índice único, ADR-003 ejecución por agente IA con identidades por rol.
  - `docs/ai-log.md`: tabla con las entradas de lo hecho hasta ahora (diseños en canvas, brainstorming, este plan).
- [ ] **Step 4:** PR "ODD y especificaciones (ciclo 1)" Closes #1; revisión de Diegoalevq (QA) verificando que cada CA es comprobable; merge.

### Task 2: Monorepo, MongoDB local y reglas puras (aaronbatistaa, rama `feat/2-monorepo`)

**Files:** Create `package.json` (workspaces `src/*`), `tsconfig.json`, `bunfig.toml` (`[test] root = "tests"`), `src/shared/{package.json,index.ts,time.ts,pricing.ts,rules.ts,schemas.ts,types.ts}`, `scripts/db-start.ts`, `scripts/db-stop.ts`; Test `tests/unit/{time,pricing,rules,schemas}.test.ts`.

**Interfaces — Produces (`@canchas/shared`):**
- `DURATIONS = [60, 90, 120] as const`; `type Duration = 60 | 90 | 120`
- `toSlot(hhmm: string): number` · `fromSlot(slot: number): string` · `slotsFor(startSlot: number, durationMin: Duration): number[]`
- `priceFor(prices: Record<"60"|"90"|"120", number>, durationMin: Duration): number`
- `weekdayOf(date: string): number` (0 = lunes … 6 = domingo)
- `fitsSchedule(schedule: ScheduleDay[], date: string, startSlot: number, durationMin: Duration): boolean`
- `isPast(date: string, startSlot: number, now: Date): boolean` · `hasEnded(date: string, startSlot: number, durationMin: Duration, now: Date): boolean`
- Zod: `RegisterInput {name 2–60, email, phone /^\+?[0-9 ]{7,15}$/, password ≥8}`, `LoginInput`, `BookingInput {courtId, date, startTime /^([01]\d|2[0-3]):(00|30)$/, durationMin}`, `GuestBookingInput = BookingInput & {guest:{name, phone}}`, `PaymentInput {amount > 0, method: "efectivo"|"transferencia"|"tarjeta"}`, `CourtInput {name, sport: "futbol"|"padel"|"basquet", format?, spaceIds ≥1, active, prices, schedule}`; fecha validada como día real (`2026-13-40` falla).
- Types: `ScheduleDay {weekday, open: "HH:MM", close: "HH:MM", closed: boolean}`, `Court`, `Booking`, `User`, `Sport`.

- [ ] **Step 1:** Tests que fallan, p. ej.: `toSlot("20:00") === 40`; `slotsFor(40, 90)` → `[40,41,42]`; `priceFor({60:50,90:75,120:95}, 90) === 75`; `fitsSchedule(LV16a23, "2026-11-19", toSlot("22:00"), 120) === false` y con 60 `=== true`; `isPast("2026-11-19", 40, new Date("2026-11-19T20:10"))=== true`; `BookingInput` rechaza `"20:15"` y `"2026-13-40"`; `RegisterInput` rechaza email inválido, teléfono `"abc"`, contraseña de 7.
- [ ] **Step 2:** `bun test tests/unit` → FAIL (módulos no existen).
- [ ] **Step 3:** Implementar funciones y esquemas listados.
- [ ] **Step 4:** `bun test tests/unit` → PASS.
- [ ] **Step 5:** `scripts/db-start.ts`: crea `.data/db`, lanza `mongod --replSet rs0 --port 27027 --dbpath .data/db --fork --logpath .data/mongod.log` y ejecuta `replSetInitiate` vía driver si no está iniciado (idempotente). Scripts en `package.json`: `db:start`, `db:stop`, `test:unit`, `test`. Verificar: `bun run db:start` dos veces sin error y `rs.status` ok (`bun -e` con el driver).
- [ ] **Step 6:** Commits + PR Closes #2; revisión de liversay (Spec) contra `data-model.md`; merge.

### Task 3: Base de datos, disponibilidad y creación de reservas (aaronbatistaa, rama `feat/3-reservas-core`)

**Files:** Create `src/api/{package.json,db.ts,seed.ts,errors.ts,availability.ts,bookings/service.ts}`, `tests/helpers/testDb.ts`; Test `tests/integration/{availability,bookings-core}.test.ts`.

**Interfaces:**
- Consumes: todo `@canchas/shared` de la Tarea 2.
- Produces:
  - `connect(uri: string, dbName: string): Promise<{client: MongoClient, db: Db}>` · `ensureIndexes(db): Promise<void>` (único `slot_locks(spaceId,date,slot)`, único `users.email`, `bookings(date)`, `bookings(userId)`)
  - `seed(db, opts?: {adminEmail, adminPassword}): Promise<void>` (idempotente; espacios, 5 canchas, precios, horario, admin `admin@canchas.local` / env `ADMIN_PASSWORD`, por defecto `admin12345`)
  - `class ConflictError`, `class RuleError`, `class NotFoundError` (mapeados luego a 409/422/404)
  - `getAvailability(db, date: string, now: Date): Promise<AvailabilityCourt[]>` donde `AvailabilityCourt = {courtId, name, sport, format, prices, slots: {slot: number, time: string, state: "libre"|"ocupado"|"cerrado"|"pasado"}[]}`; incluye solo canchas activas; los slots cubren de la apertura mínima al cierre máximo del día.
  - `createBooking(ctx: {db, client, now: Date}, input: BookingInput, owner: {userId} | {guest:{name,phone}}, createdBy: "client"|"admin"): Promise<Booking>` — valida RN-03/04/05/08, calcula `price` con `priceFor`, inserta reserva + locks de cada `spaceId × slotsFor` en `session.withTransaction`; `E11000` → `ConflictError("Ese horario ya fue tomado. Elige otro.")`.
  - `cancelBooking(ctx, bookingId: string, actor: {userId, role}): Promise<void>` — cliente solo la suya y antes del inicio; borra locks en transacción.
  - `makeTestDb(): Promise<{db, client, ctx(now?: Date), drop(): Promise<void>}>` (BD `canchas_test_<random>`, `MONGO_URL` por defecto `mongodb://127.0.0.1:27027/?replicaSet=rs0`, aplica `ensureIndexes` + `seed`).

- [ ] **Step 1:** Tests que fallan (`now = 2026-11-19T10:00`): disponibilidad del jueves tiene Media A con 20:00 `libre`; tras reservar Media A 20:00/60, Media A 20:00 y 20:30 `ocupado`, **Completa** 20:00 `ocupado`, Media B 20:00 `libre`; reservar 22:00/120 → `RuleError`; cancha inactiva → no aparece y `createBooking` → `RuleError`; precio guardado de Completa 90 min = 140; cancelar y reservar de nuevo el mismo turno funciona (Review Focus); misma reserva dos veces seguidas → `ConflictError`.
- [ ] **Step 2:** `bun run db:start && bun test tests/integration` → FAIL.
- [ ] **Step 3:** Implementar interfaces listadas.
- [ ] **Step 4:** `bun test tests/integration` → PASS.
- [ ] **Step 5:** PR Closes #3; revisión de Diegoalevq (QA); merge.

### Task 4: Suite de doble reserva + CI (Diegoalevq, rama `test/4-doble-reserva-ci`)

**Files:** Create `tests/integration/double-booking.test.ts`, `.github/workflows/ci.yml`; Modify `docs/testing.md`, `CHANGELOG.md`.

- [ ] **Step 1:** Tests (RN-01/RN-02, CA de doble reserva):
  - `"RN-01: misma cancha mismo turno → 409"`;
  - `"RN-01: solapamiento parcial 20:00/90 vs 21:00/60 → 409"`;
  - `"RN-02: completa bloquea ambas mitades"` y `"RN-02: una mitad ocupada bloquea la completa"`;
  - `"RN-02: completa 20:00/60 con Media A 20:30/60 → 409"` (Review Focus);
  - `"RN-01: 10 reservas concurrentes al mismo turno → exactamente 1 éxito y 9 ConflictError"` (`Promise.allSettled`), y `slot_locks` del turno = 2 (un lock por bloque).
- [ ] **Step 2:** `bun test tests/integration/double-booking.test.ts` → PASS (si alguna falla, issue de bug para Dev y se corrige en esa misma rama con commit de aaronbatistaa).
- [ ] **Step 3:** `ci.yml`: en `pull_request` y `push` a main; `ubuntu-latest`; `oven-sh/setup-bun@v2`; instalar MongoDB 8 desde el repositorio apt oficial de MongoDB; `bun install`; `bun run db:start`; `bun test`.
- [ ] **Step 4:** Push; verificar el check verde en el PR (`gh pr checks`).
- [ ] **Step 5:** `docs/testing.md`: estrategia, cómo correr, tabla RN/CA → prueba, resultado. `CHANGELOG.md` sección `[Ciclo 1]`. PR Closes #4; revisión de aaronbatistaa (Dev); merge.

## Ciclo 2 — Spec: aaronbatistaa · Dev: Diegoalevq · QA: liversay

### Task 5: Specs del ciclo 2 (aaronbatistaa, rama `docs/5-specs-ciclo-2`)

- [ ] **Step 1:** Refinar `api.md` (cuerpos y respuestas de cada endpoint del ciclo 2), `acceptance-criteria.md` (CA de auth, admin, cobro, no-show con ids estables), `implementation-plan.md` (estado ciclo 1 ✔, ciclo 2 en curso), `docs/decisions.md` ADR-004 sesión con cookie firmada.
- [ ] **Step 2:** PR Closes #5; revisión de liversay (QA): cada CA nuevo tiene prueba prevista; merge.

### Task 6: API HTTP: auth, reservas y admin (Diegoalevq, rama `feat/6-api`)

**Files:** Create `src/api/{app.ts,server.ts,auth.ts,routes/{public,bookings,admin}.ts,admin/service.ts}`; Test `tests/integration/{auth,api-bookings,admin}.test.ts`.

**Interfaces:**
- Consumes: Tareas 2–3.
- Produces:
  - `createApp(deps: {db, client, now?: () => Date, secret: string}): Hono`
  - Cookie firmada `sid` (httpOnly, sameSite Lax) con `userId`; contraseñas con `Bun.password.hash/verify`.
  - Rutas exactas de `specs/api.md` / diseño §6, incluidas `POST /api/admin/bookings`, `/payment`, `/no-show`, `/cancel`, `GET /api/admin/payments?status=pending|paid`, `GET|POST|PUT /api/admin/courts[/:id]` (sin DELETE si tiene reservas → RN-10: 409).
  - `registerPayment(ctx, id, PaymentInput, adminId)`: 422 si `!hasEnded`, 409 si ya pagada, cancelada o `no_show`. `markNoShow(ctx, id)`: 422 si no terminó.
  - `server.ts`: `Bun.serve({port: Number(process.env.PORT ?? 3000), fetch: app.fetch})`; al arrancar `ensureIndexes` + `seed`.
- [ ] **Step 1:** Tests con `app.request()`: registro válido 201 y email repetido 409; datos inválidos 400 con el campo en el error; login erróneo 401; `/api/bookings` sin sesión 401; cliente → `/api/admin/*` 403; reserva OK 201 y repetida 409 con el mensaje exacto; `GET /mine` solo las propias; cancelar ajena 404; admin crea reserva de invitado 201 (sin guest → 400); pagar antes de terminar 422, después 200, de nuevo 409; no-show luego pagar 409; `PUT` cancha `active:false` → desaparece de `/api/availability`; borrar cancha con reservas 409.
- [ ] **Step 2:** `bun test tests/integration` → FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** PR Closes #6; revisión de aaronbatistaa (Spec) contra `api.md`; merge.

### Task 7: Web cliente (Diegoalevq, rama `feat/7-web-cliente`)

**Files:** Create `src/web/{package.json,index.html,vite.config.ts,src/{main.tsx,App.tsx,api.ts,styles.css,pages/{Availability,Login,Register,MyBookings}.tsx,components/{AvailabilityGrid,DayStrip,DurationPicker,BookingPanel,Header}.tsx}}`; script raíz `dev` (api :3000 + vite :5173 con proxy `/api`).

**Interfaces:** Consumes la API de la Tarea 6 vía `api.ts` (`fetch` con `credentials: "include"`).

- [ ] **Step 1:** Implementar según diseño §7 y el canvas: tira de 7 días desde hoy, filtro deporte (Todas/Fútbol/Pádel/Básquet), duración 1 h · 1 h 30 · 2 h, cuadrícula filas = canchas, columnas = bloques 30 min con columna de canchas fija y scroll horizontal en móvil; bloque libre = botón con `aria-label "<cancha> <hora> libre"`; al elegir, se resaltan los bloques de la duración (si no cabe, aviso inline "No cabe en ese horario"); panel "Tu reserva" con precio de `priceFor`; sin sesión → "Ingresa para reservar" lleva a /ingresar y vuelve. Tras reservar: confirmación y la celda pasa a ocupada. 409 → mensaje exacto y refresco de disponibilidad. Mis reservas con cancelar.
- [ ] **Step 2:** Verificar con Playwright MCP (navegador): reservar Media A, comprobar que Completa queda ocupada en ese bloque; captura en 1280 y 390 px sin scroll horizontal de página.
- [ ] **Step 3:** PR Closes #7 con capturas; revisión de liversay (QA); merge.

### Task 8: Web backoffice (Diegoalevq, rama `feat/8-backoffice`)

**Files:** Create `src/web/src/pages/admin/{AdminLayout,DayBookings,Courts,Payments}.tsx`, `components/admin/{NewBookingForm,PaymentForm,ScheduleEditor,PriceEditor}.tsx`; rutas `/admin`, `/admin/canchas`, `/admin/pagos` protegidas por rol.

- [ ] **Step 1:** Implementar como C-Backoffice: reservas del día (tabla hora/cancha/cliente/estado/pago, navegación por día, "Nueva reserva" invitado con nombre + teléfono), canchas (tarjetas, activa/mantenimiento, precios 60/90/120, horario semanal con interruptores), pagos (por cobrar con "Cobrar $X" → formulario monto prellenado + método; "No se presentó"; cobrados del día con total).
- [ ] **Step 2:** Verificar con Playwright MCP: login admin, crear reserva invitado, cambiar precio de pádel y ver el nuevo precio en la vista cliente.
- [ ] **Step 3:** PR Closes #8 con capturas; revisión de liversay; merge.

### Task 9: Pruebas de aceptación e2e (liversay, rama `test/9-e2e`)

**Files:** Create `playwright.config.ts` (`testMatch: "**/*.e2e.ts"`, `webServer` que corre `bun run e2e:server` = api con `MONGO_DB=canchas_e2e` sembrada desde cero + vite), `tests/e2e/{cliente,doble-reserva,backoffice,validaciones}.e2e.ts`, `tests/e2e/fixtures.ts`; Modify `docs/testing.md`, `CHANGELOG.md`.

- [ ] **Step 1:** `bun add -d @playwright/test && bunx playwright install chromium`.
- [ ] **Step 2:** Pruebas nombradas con sus CA, p. ej. `test("CA-04 cliente reserva un turno libre", …)`, `test("CA-0x completa no disponible si una mitad está ocupada", …)`, `test("CA-0x dos usuarios mismo turno: el segundo ve el mensaje de choque", …)` (dos contextos de navegador), registro con datos inválidos muestra errores por campo, admin cobra una reserva jugada (fecha pasada sembrada por fixture vía API), admin marca no-show.
- [ ] **Step 3:** `bunx playwright test` → PASS; adjuntar resumen al PR.
- [ ] **Step 4:** `docs/testing.md` tabla CA → prueba completa; `CHANGELOG.md` `[Ciclo 2]`. PR Closes #9; revisión de Diegoalevq (Dev); merge.

## Ciclo 3 — Spec: Diegoalevq · Dev: liversay · QA: aaronbatistaa

### Task 10: Cambio de requerimiento CR-01 en las specs (Diegoalevq, rama `docs/10-cr-01-recurrentes`)

- [ ] **Step 1:** Issues `#10 CR-01 Reservas recurrentes (cambio solicitado)`, `#11 Implementar series`, `#12 Pruebas de series y cierre`, con el texto del cambio y la fecha.
- [ ] **Step 2:** Actualizar, marcando cada cambio con `CR-01`: `requirements.md` (RF-15 series semanales 2–8 semanas, cliente o admin; RF-16 cancelar ocurrencias futuras), `business-rules.md` (RN-12 todo-o-nada con la fecha que choca en el error; RN-13 cada ocurrencia se cobra/cancela por separado), `acceptance-criteria.md` (CA-15…CA-18), `api.md` (`POST /api/bookings/series`, `POST /api/admin/bookings/series`, `POST /api/bookings/series/:seriesId/cancel-future`), `data-model.md` (`bookings.seriesId?`), `implementation-plan.md` (ciclo 3), `docs/decisions.md` ADR-005, `CHANGELOG.md` `[Ciclo 3] Cambio solicitado`.
- [ ] **Step 3:** PR Closes #10; revisión de liversay (Dev); merge.

### Task 11: Implementar reservas recurrentes (liversay, rama `feat/11-series`)

**Interfaces:**
- Produces: `SeriesInput = BookingInput & {weeks: 2..8}` en shared; `createSeries(ctx, input: SeriesInput, owner, createdBy): Promise<{seriesId: string, bookings: Booking[]}>` — una transacción para todas las ocurrencias (`date + 7·k`); un choque → `ConflictError("Ese horario ya fue tomado el <fecha>. Elige otro.")` y no se crea ninguna; `cancelFutureInSeries(ctx, seriesId, actor)`.
- [ ] **Step 1:** Tests de integración que fallan: serie 4 semanas crea 4 reservas con el mismo `seriesId`; una semana ocupada → 409 con esa fecha y 0 reservas nuevas; cancelar una ocurrencia deja las otras; `cancel-future` solo toca las que no empezaron; cada ocurrencia se cobra por separado.
- [ ] **Step 2:** FAIL → implementar (servicio, rutas, UI: casilla "Repetir cada semana" + selector de semanas en el panel del cliente y en Nueva reserva del admin; Mis reservas agrupa por serie con "Cancelar las próximas") → PASS.
- [ ] **Step 3:** Verificar con Playwright MCP en el navegador.
- [ ] **Step 4:** PR Closes #11; revisión de Diegoalevq (Spec) contra CA-15…18; merge.

### Task 12: Pruebas de la serie, evidencia y cierre (aaronbatistaa, rama `test/12-series-cierre`)

- [ ] **Step 1:** `tests/e2e/series.e2e.ts` con CA-15…CA-18; `bun test && bunx playwright test` → todo PASS.
- [ ] **Step 2:** `docs/testing.md`: sección "Evidencia CR-01" con el recorrido cambio → spec → CA → plan → código → pruebas → resultado (enlaces a issues, PRs y commits).
- [ ] **Step 3:** `README.md` final: qué resuelve, stack, requisitos (Bun, mongod 8), `bun install`, `bun run db:start`, `bun run dev`, credenciales admin de desarrollo, cómo correr pruebas, estructura, equipo y rotación de roles, enlaces a specs.
- [ ] **Step 4:** PR Closes #12; revisión de liversay; merge. Verificar CI verde en `main`.
