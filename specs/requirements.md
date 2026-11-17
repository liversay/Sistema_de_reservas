# Requisitos

Roles: **cliente** (con cuenta) y **administrador** (rol sembrado). Cada RF se vincula a reglas
(`business-rules.md`) y criterios de aceptación (`acceptance-criteria.md`).

## Requisitos funcionales

| ID | Requisito | Reglas | CA |
|---|---|---|---|
| RF-01 | El cliente ve la disponibilidad de un día como cuadrícula canchas × bloques de 30 min, con tira de días. | RN-02, RN-04, RN-08 | CA-01 |
| RF-02 | El cliente filtra la cuadrícula por deporte (fútbol, pádel, básquet). | — | CA-02 |
| RF-03 | El cliente elige la duración (1 h, 1 h 30, 2 h) y ve el precio antes de confirmar. | RN-03, RN-10 | CA-03 |
| RF-04 | El cliente autenticado reserva una cancha libre; el precio se copia a la reserva. | RN-01..RN-05, RN-08 | CA-04, CA-05, CA-06 |
| RF-05 | El cliente ve sus reservas ("Mis reservas") con estado y pago. | — | CA-04, CA-07 |
| RF-06 | El cliente cancela su reserva antes de que empiece; se liberan los bloques. | RN-06 | CA-07 |
| RF-07 | El cliente crea una cuenta (nombre, email, teléfono, contraseña) con validaciones. | — | CA-08 |
| RF-08 | El cliente inicia y cierra sesión; la sesión es una cookie firmada httpOnly. | — | CA-09 |
| RF-09 | El admin ve las reservas de un día (tabla con estado y pago) y puede cancelar cualquiera. | RN-06 | CA-10 |
| RF-10 | El admin crea reservas para clientes sin cuenta (nombre y teléfono obligatorios). | RN-09 | CA-11 |
| RF-11 | El admin registra el pago (monto, método, quién cobró) de una reserva ya jugada; lista "por cobrar" y "cobrados". | RN-07, RN-11 | CA-12 |
| RF-12 | El admin marca una reserva jugada como "no se presentó". | RN-11 | CA-13 |
| RF-13 | El admin administra canchas, horarios semanales y precios por duración (crear, editar). | RN-04, RN-10 | CA-14 |
| RF-14 | El admin activa o desactiva una cancha (mantenimiento); una cancha con reservas no se borra. | RN-08, RN-10 | CA-14 |
| RF-15 | **CR-01** El cliente (o el admin para un invitado) crea una **serie semanal**: la misma cancha, hora y duración repetidas cada 7 días, de 2 a 8 ocurrencias contando la primera. Cada ocurrencia es una reserva propia con un `seriesId` compartido. | RN-01..RN-05, RN-08, RN-09, RN-12, RN-13 | CA-15, CA-16, CA-18 |
| RF-16 | **CR-01** El dueño de la serie (cliente) o el admin cancela "las próximas": solo las ocurrencias que aún no empezaron; las ya jugadas o en curso no cambian. | RN-06, RN-13 | CA-17 |

## Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | **Sin Docker.** MongoDB corre con el `mongod` local (v8) como replica set de un nodo (necesario para transacciones). |
| RNF-02 | **Stack:** TypeScript, React, Bun, Hono, MongoDB (ver `architecture.md`, "Libertad tecnológica"). |
| RNF-03 | **Integridad:** la regla anti-doble-reserva la garantiza la base de datos (índice único), no solo el código. |
| RNF-04 | **Accesibilidad táctil:** objetivos interactivos de al menos 44 px; en móvil la cuadrícula se desplaza horizontalmente con la columna de canchas fija. |
| RNF-05 | **Contraste:** texto con contraste suficiente (WCAG AA, 4.5:1) sobre la paleta `#0F3D2A` / `#F2B705` / `#F2F5F0`. |
| RNF-06 | **Idioma:** interfaz y mensajes en español. |
| RNF-07 | **Pruebas:** unitarias e integración con `bun test`; aceptación con Playwright; CI en GitHub Actions para unitarias e integración. |
| RNF-08 | **Determinismo temporal:** todo lo que depende del reloj recibe `now: Date` inyectable. |
| RNF-09 | **Seguridad:** contraseñas con hash; rutas `/api/admin/*` exigen rol admin (401 sin sesión, 403 sin rol). |
| RNF-10 | **Trazabilidad:** issues, ramas, PRs, commits por integrante y `docs/ai-log.md`. |
