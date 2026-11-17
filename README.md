# Sistema de Reservas de Canchas

Sistema web para reservar canchas deportivas (fútbol divisible en dos mitades, pádel y básquet)
con backoffice para el administrador.

## Problema y outcome

El complejo coordina las reservas por WhatsApp y hay cruces de horario. El cliente debe poder ver qué
está libre y reservar en menos de un minuto; el administrador debe tener cero reservas
superpuestas y saber qué falta por cobrar. Ver [`specs/outcomes.md`](specs/outcomes.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`specs/outcomes.md`](specs/outcomes.md) | Problema, outcomes, preguntas, métricas |
| [`specs/requirements.md`](specs/requirements.md) | RF-01…RF-22 y RNF |
| [`specs/business-rules.md`](specs/business-rules.md) | RN-01…RN-16, precios |
| [`specs/acceptance-criteria.md`](specs/acceptance-criteria.md) | CA-01…CA-25 |
| [`specs/architecture.md`](specs/architecture.md) | Arquitectura y libertad tecnológica |
| [`specs/data-model.md`](specs/data-model.md) | Colecciones e índices |
| [`specs/api.md`](specs/api.md) | Endpoints y errores |
| [`specs/implementation-plan.md`](specs/implementation-plan.md) | Ciclos, tareas y roles |
| [`docs/decisions.md`](docs/decisions.md) | ADR |
| [`docs/ai-log.md`](docs/ai-log.md) | Uso de IA |
| [`docs/testing.md`](docs/testing.md) | Estrategia, tabla CA → prueba y evidencia CR-01 y CR-02 |

## Qué hace

- **Reserva sin cuenta:** cualquier visitante reserva con nombre y teléfono (sin registrarse); para cancelar llama al complejo.
- **Club de socios:** quien crea cuenta e inicia sesión recibe un descuento (10 % por defecto, lo configura el admin; solo afecta a reservas nuevas). Ejemplo: Media A 60 min, $50 → $45.
- **Horizonte de 30 días:** se puede reservar hasta hoy + 30 días (la tira muestra 31 días y hay selector de fecha); las horas pasadas no se pueden elegir y todas las horas se muestran en 12 h («8:00 p. m.»).
- **Series semanales** (CR-01): repetir la misma cancha y hora de 2 a 8 semanas, dentro del horizonte.
- **Backoffice (`/admin`):** un tablero de canchas × bloques de 30 min con pestañas **Reservas** y **Pagos** (`?vista=pagos`). Cada reserva es una barra con tarjeta de detalle (cobrar, no se presentó, cancelar, cancelar las próximas de la serie). El tablero de Pagos muestra total cobrado, por cobrar, ocupación y no-shows, el desglose por método (efectivo, tarjeta, transferencia y **Yappy**), el cobrado por día y el ajuste del % de socios.

## Stack

TypeScript en todo el proyecto, con **Bun** (runtime, gestor de paquetes y ejecutor de pruebas, sin paso de build para la API), **Hono** (API HTTP mínima y tipada), **React + Vite** (web de cliente y backoffice) y **MongoDB** local con replica set (las transacciones y el índice único de `slot_locks` garantizan que no haya dobles reservas, RN-01). Sin Docker. Playwright para las pruebas de aceptación. Razones y alternativas en [`docs/decisions.md`](docs/decisions.md) y [`specs/architecture.md`](specs/architecture.md).

## Requisitos

- [Bun](https://bun.sh) 1.3 o superior.
- `mongod` 8 instalado localmente (sin Docker). `bun run db:start` lo levanta como replica set `rs0` en `127.0.0.1:27027`.
- Para las pruebas e2e: Chromium de Playwright (`bunx playwright install chromium`).

## Puesta en marcha

```bash
bun install
bun run db:start      # MongoDB local (replica set rs0, puerto 27027)
bun run db:seed       # canchas, horarios y cuenta de administrador
bun run dev           # web en http://localhost:5173 y API en http://localhost:3000
```

Administrador de desarrollo: `admin@canchas.local` / `admin12345` (**solo desarrollo**). En producción `ADMIN_PASSWORD` y `SESSION_SECRET` son obligatorios y la API no arranca sin ellos. `bun run db:stop` detiene MongoDB.

## Pruebas

```bash
bun test                                              # unitarias + integración (BD aleatoria canchas_test_*, se elimina al terminar)
bunx playwright install chromium && bunx playwright test   # aceptación e2e (CA-01…CA-25); levanta API + web y recrea la BD canchas_e2e
```

Los puertos 3000 y 5173 deben estar libres al correr Playwright. Estrategia, tabla CA → prueba y la evidencia de los cambios CR-01 y CR-02 están en [`docs/testing.md`](docs/testing.md). CI: GitHub Actions corre `bun test` en cada PR.

## Estructura

```text
specs/    Specs: outcomes, requisitos, reglas, criterios de aceptación, API, modelo, plan
docs/     decisiones (ADR), registro de uso de IA, estrategia y evidencia de pruebas
src/
  api/      API Hono, servicios de reservas/admin, acceso a MongoDB, seed
  shared/   reglas puras, precios, tiempo y esquemas Zod (compartidos con la web)
  web/      React + Vite: cliente y backoffice (/admin)
scripts/  db:start/db:stop, dev y servidor e2e
tests/    unit/, integration/ (bun test) y e2e/ (Playwright, *.e2e.ts)
```

## Equipo y rotación de roles

Los roles rotan por ciclo (detalle en [`specs/implementation-plan.md`](specs/implementation-plan.md)).

| Ciclo | Alcance | Product/Spec | Arquitectura/Dev | QA/DevOps |
|---|---|---|---|---|
| 1 | Specs, monorepo, DB local, modelo, disponibilidad + regla anti-choque | liversay | aaronbatistaa | Diegoalevq |
| 2 | Reserva del cliente, cuentas, Mis reservas, backoffice | aaronbatistaa | Diegoalevq | liversay |
| 3 | Cambio de requerimiento (reservas recurrentes, CR-01), pagos, README, cierre | Diegoalevq | liversay | aaronbatistaa |
| 4 | Cambio de requerimiento (reserva sin cuenta, socios, horizonte, tablero; CR-02) | liversay | aaronbatistaa | Diegoalevq |

## Limitaciones conocidas

- El cierre de sesión no revoca una cookie de sesión copiada: sigue siendo válida hasta 7 días (ADR-004).
- Reservar sin cuenta no permite cancelar desde la web: el invitado llama al complejo (el admin cancela desde el tablero).
- El tablero del backoffice y los bloques pasados usan la hora local del navegador y del servidor; no hay manejo de zonas horarias distintas.
- El 10 % de descuento y el rango 0–50 son valores provisionales acordados con el usuario.

## Estado

Ciclos 1 a 4 completados: ciclos 1 a 3 publicados (PRs #10 y #15–#26) y ciclo 4 (CR-02) con spec #33, API #34, web cliente #35, backoffice #36 y pruebas y evidencia #37 (Closes #32); el CI de GitHub Actions (`bun test`) corre en cada PR. Pruebas: 128 `bun test` y 27 e2e (CA-01…CA-25). Historial en [`CHANGELOG.md`](CHANGELOG.md).
