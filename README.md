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
| [`specs/requirements.md`](specs/requirements.md) | RF-01…RF-14 y RNF |
| [`specs/business-rules.md`](specs/business-rules.md) | RN-01…RN-11, precios |
| [`specs/acceptance-criteria.md`](specs/acceptance-criteria.md) | CA-01…CA-14 |
| [`specs/architecture.md`](specs/architecture.md) | Arquitectura y libertad tecnológica |
| [`specs/data-model.md`](specs/data-model.md) | Colecciones e índices |
| [`specs/api.md`](specs/api.md) | Endpoints y errores |
| [`specs/implementation-plan.md`](specs/implementation-plan.md) | Ciclos, tareas y roles |
| [`docs/decisions.md`](docs/decisions.md) | ADR |
| [`docs/ai-log.md`](docs/ai-log.md) | Uso de IA |
| [`docs/testing.md`](docs/testing.md) | Estrategia y tabla CA → prueba |

## Stack

TypeScript, React + Vite, Bun, Hono, MongoDB local (sin Docker). Ver `specs/architecture.md`.

## Estado

Ciclo 1 en curso: especificaciones. Las instrucciones de instalación y ejecución se añaden con el código.
