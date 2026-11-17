# Arquitectura

## Visión general

Monorepo con Bun workspaces:

```
README.md  specs/  docs/  src/api (Hono)  src/web (React + Vite)  src/shared  tests/
```

- `src/shared` (`@canchas/shared`): esquemas Zod, cálculo de bloques, precios y reglas puras
  (horario de atención, pasado, fin de juego). Lo usan API y web.
- `src/api`: Hono sobre Bun con el driver oficial `mongodb`. Crear y cancelar reservas usan
  transacciones. Sesión con cookie firmada httpOnly; rutas `/api/admin/*` protegidas por rol.
- `src/web`: React + Vite + React Router. Estilo dirección C (verde `#0F3D2A`, amarillo `#F2B705`,
  fondo `#F2F5F0`, Bricolage Grotesque + Manrope) con la cuadrícula canchas × bloques de la
  dirección A. Español.
- **MongoDB local sin Docker:** `bun run db:start` lanza `mongod --replSet rs0 --port 27027
  --dbpath ./.data/db` e inicializa el replica set de un nodo; `bun run db:seed` carga canchas,
  precios, horarios y el admin.

## Garantía anti-choque

Cada reserva escribe un documento `slot_locks` por bloque de 30 min y por **espacio físico** que
ocupa, bajo índice único `(spaceId, date, slot)`, dentro de una transacción. La completa de fútbol
bloquea ambos espacios, por lo que choca con cualquiera de las mitades (RN-02). Un `E11000` se
traduce en `409` "Ese horario ya fue tomado. Elige otro." Ver ADR-002 en `docs/decisions.md`.

## Tiempo

Fechas `YYYY-MM-DD`, horas `HH:MM`, hora local del servidor. Toda función que depende del reloj
recibe `now: Date` inyectable para que sea determinista en pruebas.

## Pruebas y CI

Unitarias e integración con `bun test` (`tests/**/*.test.ts`); aceptación con Playwright
(`tests/e2e/*.e2e.ts`); nunca `.spec.ts`. CI en GitHub Actions instala binarios de MongoDB (sin
Docker) y corre unitarias e integración en cada PR.

## Libertad tecnológica

El proyecto permite cualquier lenguaje, base de datos y stack. Se elige:

| Capa | Tecnología | Por qué |
|---|---|---|
| Lenguaje | TypeScript | Un solo lenguaje y tipos compartidos entre API y web. |
| Runtime / pruebas | Bun | Arranque rápido, `bun test` y workspaces integrados. |
| API | Hono | Ligero, tipado, corre nativo en Bun. |
| Web | React + Vite | Estándar conocido por el equipo, buen soporte de cuadrículas interactivas. |
| Base de datos | MongoDB (replica set de un nodo, `mongod` local) | Índices únicos y transacciones multi-documento que sostienen RN-01/RN-02 en la base de datos; sin Docker. |
| Validación | Zod | Mismos esquemas en cliente y servidor. |
| E2E | Playwright | Pruebas de aceptación de los flujos principales. |

Detalle de la decisión en ADR-001.
