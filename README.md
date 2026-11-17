# Sistema de Reservas de Canchas

Sistema web para reservar canchas deportivas (fútbol divisible en dos mitades, pádel y básquet)
con backoffice para el administrador. Proyecto 2 de Tópicos Especiales II (ODD → SDD → código →
pruebas).

## Problema y outcome

El complejo coordina reservas por WhatsApp y hay cruces de horario. El cliente debe poder ver qué
está libre y reservar en menos de un minuto; el administrador debe tener cero reservas
superpuestas y saber qué falta por cobrar. Ver [`specs/outcomes.md`](specs/outcomes.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`specs/outcomes.md`](specs/outcomes.md) | ODD: problema, outcomes, preguntas, métricas |
| [`specs/requirements.md`](specs/requirements.md) | RF-01…RF-16 y RNF |
| [`specs/business-rules.md`](specs/business-rules.md) | RN-01…RN-13, precios |
| [`specs/acceptance-criteria.md`](specs/acceptance-criteria.md) | CA-01…CA-18 |
| [`specs/architecture.md`](specs/architecture.md) | Arquitectura y libertad tecnológica |
| [`specs/data-model.md`](specs/data-model.md) | Colecciones e índices |
| [`specs/api.md`](specs/api.md) | Endpoints y errores |
| [`specs/implementation-plan.md`](specs/implementation-plan.md) | Ciclos, tareas y roles |
| [`docs/decisions.md`](docs/decisions.md) | ADR |
| [`docs/ai-log.md`](docs/ai-log.md) | Uso de IA |
| [`docs/testing.md`](docs/testing.md) | Estrategia, tabla CA → prueba y evidencia CR-01 |

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
bunx playwright install chromium && bunx playwright test   # aceptación e2e (CA-01…CA-18); levanta API + web y recrea la BD canchas_e2e
```

Los puertos 3000 y 5173 deben estar libres al correr Playwright. Estrategia, tabla CA → prueba y la evidencia del cambio CR-01 están en [`docs/testing.md`](docs/testing.md). CI: GitHub Actions corre `bun test` en cada PR.

## Estructura

```text
specs/    ODD y SDD: outcomes, requisitos, reglas, criterios de aceptación, API, modelo, plan
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
| 1 | ODD + specs, monorepo, DB local, modelo, disponibilidad + regla anti-choque | liversay | aaronbatistaa | Diegoalevq |
| 2 | Reserva del cliente, cuentas, Mis reservas, backoffice | aaronbatistaa | Diegoalevq | liversay |
| 3 | Cambio de requerimiento (reservas recurrentes, CR-01), pagos, README, cierre | Diegoalevq | liversay | aaronbatistaa |

## Limitaciones conocidas

- El cierre de sesión no revoca una cookie de sesión copiada: sigue siendo válida hasta 7 días (ADR-004).
- La API no limita hasta qué fecha se puede reservar; la interfaz solo muestra 7 días.

## Estado

Ciclos 1 a 3 completados y publicados: PRs #10 y #15–#26 mergeados en `main`, con el CI de GitHub Actions (`bun test`) en verde en cada PR. Pruebas: 91 `bun test` y 20 e2e, incluidas las reservas recurrentes (CR-01, CA-15…CA-18). Historial en [`CHANGELOG.md`](CHANGELOG.md).
