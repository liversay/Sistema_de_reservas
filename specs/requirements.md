# Requisitos

Roles: **cliente** (con cuenta, ahora «socio» del club de fidelidad, CR-02; reservar ya no exige cuenta) y **administrador** (rol sembrado). Cada RF se vincula a reglas
(`business-rules.md`) y criterios de aceptación (`acceptance-criteria.md`).

## Requisitos funcionales

| ID | Requisito | Reglas | CA |
|---|---|---|---|
| RF-01 | El cliente ve la disponibilidad de un día como cuadrícula canchas × bloques de 30 min, con tira de días. | RN-02, RN-04, RN-08 | CA-01 |
| RF-02 | El cliente filtra la cuadrícula por deporte (fútbol, pádel, básquet). | — | CA-02 |
| RF-03 | El cliente elige la duración (1 h, 1 h 30, 2 h) y ve el precio antes de confirmar. | RN-03, RN-10 | CA-03 |
| RF-04 | El cliente reserva una cancha libre; el precio se copia a la reserva. *(Modificado por CR-02: antes exigía cliente autenticado; ahora puede reservar sin cuenta, ver RF-17, y con sesión recibe el descuento de RF-18.)* | RN-01..RN-05, RN-08, RN-14, RN-15 | CA-04, CA-05, CA-06, CA-19 |
| RF-05 | El cliente ve sus reservas ("Mis reservas") con estado y pago. | — | CA-04, CA-07 |
| RF-06 | El cliente cancela su reserva antes de que empiece; se liberan los bloques. | RN-06 | CA-07 |
| RF-07 | El cliente crea una cuenta (nombre, email, teléfono, contraseña) con validaciones. *(CR-02: la cuenta pasa a ser la membresía del club de socios, RF-18; ya no es necesaria para reservar.)* | — | CA-08, CA-20 |
| RF-08 | El cliente inicia y cierra sesión; la sesión es una cookie firmada httpOnly. | — | CA-09 |
| RF-09 | El admin ve las reservas de un día (tabla con estado y pago) y puede cancelar cualquiera. *(CR-02: la tabla se sustituye por el tablero de RF-20.)* | RN-06 | CA-10 |
| RF-10 | El admin crea reservas para clientes sin cuenta (nombre y teléfono obligatorios). | RN-09 | CA-11 |
| RF-11 | El admin registra el pago (monto, método, quién cobró) de una reserva ya jugada; lista "por cobrar" y "cobrados". *(CR-02: el método admite además `yappy`: efectivo, transferencia, tarjeta, yappy.)* | RN-07, RN-11 | CA-12 |
| RF-12 | El admin marca una reserva jugada como "no se presentó". | RN-11 | CA-13 |
| RF-13 | El admin administra canchas, horarios semanales y precios por duración (crear, editar). | RN-04, RN-10 | CA-14 |
| RF-14 | El admin activa o desactiva una cancha (mantenimiento); una cancha con reservas no se borra. | RN-08, RN-10 | CA-14 |
| RF-15 | **CR-01** El cliente (o el admin para un invitado) crea una **serie semanal**: la misma cancha, hora y duración repetidas cada 7 días, de 2 a 8 ocurrencias contando la primera *(CR-02: por el horizonte de 30 días, RN-14, en la práctica máximo 5)*. Cada ocurrencia es una reserva propia con un `seriesId` compartido. | RN-01..RN-05, RN-08, RN-09, RN-12, RN-13 | CA-15, CA-16, CA-18 |
| RF-16 | **CR-01** El dueño de la serie (cliente) o el admin cancela "las próximas": solo las ocurrencias que aún no empezaron; las ya jugadas o en curso no cambian. | RN-06, RN-13 | CA-17 |
| RF-17 | **CR-02** Cualquier visitante reserva **sin cuenta**: elige cancha y horario e indica nombre y teléfono (obligatorios). Vale también para series. "Mis reservas" y cancelar desde la web siguen siendo solo para usuarios con cuenta. | RN-01..RN-05, RN-08, RN-15 | CA-19 |
| RF-18 | **CR-02** **Club de socios:** iniciar sesión da un descuento porcentual configurable en el backoffice (por defecto 10 %, rango 0–50) sobre las reservas hechas con sesión; la web lo muestra («Socio: −10 %») y el login/registro se presenta como «Club de socios», con la tarjeta del formulario separada del encabezado (margen superior ≥ 32 px a 1280 y a 390 px). | RN-16, RN-10 | CA-20, CA-25 |
| RF-19 | **CR-02** Horizonte de reserva: solo hasta 30 días de anticipación; la web ofrece 31 días (hoy + 30) y un selector de fecha acotado. Cada ocurrencia de una serie cumple el mismo límite. | RN-14, RN-12 | CA-21 |
| RF-20 | **CR-02** Backoffice, pestaña **Reservas**: tablero calendario (canchas × bloques, barras por reserva) con tira de 31 días que marca los días con reservas; al pasar el cursor, enfocar o tocar una reserva aparece una tarjeta (nombre, teléfono, fecha larga, horario, cancha, precio y descuento, estado, pago, «terminó»/«en curso»/«por jugar», serie) con las acciones cobrar, no se presentó y cancelar. Las canceladas del día se listan bajo el tablero. Una reserva nueva para invitado se abre desde un bloque libre. | RN-06, RN-07, RN-09, RN-11, RN-13 | CA-23 |
| RF-21 | **CR-02** Backoffice, pestaña **Pagos** (mismo tablero intercambiable, `?vista=pagos`): barras coloreadas por pago (pagado / por cobrar / no aplica) e indicadores del rango día/semana/mes: total cobrado, por cobrar, reservas, ocupación %, no-shows, desglose por método (efectivo, transferencia, tarjeta, yappy) y cobrado por día. | RN-07, RN-11, RN-16 | CA-24 |
| RF-22 | **CR-02** Todas las horas visibles (cliente y backoffice) se muestran en formato de 12 horas (`8:00 p. m.`) y las fechas largas en español; la API conserva `HH:MM` de 24 h. La UI no permite elegir bloques ya iniciados (cliente y admin). | RN-05 | CA-22 |

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
