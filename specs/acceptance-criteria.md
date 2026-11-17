# Criterios de aceptación

Formato Dado / Cuando / Entonces. La numeración CA-01…CA-25 es **estable**: las tareas, pruebas y
`docs/testing.md` la referencian. Datos de ejemplo: jueves `2026-11-19` (L–V, atención 16:00–23:00),
sábado `2026-11-21` (S–D, atención 08:00–23:00), canchas y precios sembrados según `business-rules.md`.
Un `now` anterior al turno se asume salvo que se indique lo contrario.

| CA | Tema | RF | RN |
|---|---|---|---|
| CA-01 | Ver disponibilidad | RF-01 | RN-02, RN-04, RN-08 |
| CA-02 | Filtro por deporte | RF-02 | — |
| CA-03 | Elegir duración y precio | RF-03 | RN-03, RN-10 |
| CA-04 | Cliente reserva un turno libre | RF-04, RF-05 | RN-01, RN-03, RN-04, RN-05 |
| CA-05 | Doble reserva en la misma cancha | RF-04 | RN-01 |
| CA-06 | Mitad contra completa | RF-04 | RN-01, RN-02 |
| CA-07 | Cancelar libera el turno | RF-06 | RN-06 |
| CA-08 | Validación de registro | RF-07 | — |
| CA-09 | Inicio de sesión *(CR-02: «reservar sin sesión responde 401» ya no aplica, ver CA-19)* | RF-08 | — |
| CA-10 | Admin ve reservas del día | RF-09 | RN-06 |
| CA-11 | Admin crea reserva para invitado | RF-10 | RN-09 |
| CA-12 | Pago solo después de jugar | RF-11 | RN-07, RN-11 |
| CA-13 | No se presentó | RF-12 | RN-11 |
| CA-14 | Configurar canchas, precios, horario y estado | RF-13, RF-14 | RN-04, RN-08, RN-10 |
| CA-15 | **CR-01** Crear una serie semanal | RF-15 | RN-01..RN-05, RN-08, RN-12, RN-13 |
| CA-16 | **CR-01** Serie todo-o-nada ante conflicto | RF-15 | RN-01, RN-02, RN-12 |
| CA-17 | **CR-01** Cancelar las próximas de una serie | RF-16 | RN-06, RN-13 |
| CA-18 | **CR-01** Admin crea serie para invitado y cada ocurrencia se cobra aparte | RF-15 | RN-09, RN-07, RN-12, RN-13 |
| CA-19 | **CR-02** Reservar sin cuenta (nombre y teléfono) | RF-17 | RN-15, RN-01..RN-05 |
| CA-20 | **CR-02** Socio con sesión recibe descuento; cambiar el % no altera reservas previas | RF-18 | RN-16, RN-10 |
| CA-21 | **CR-02** Horizonte de 30 días (reservas y ocurrencias de series) | RF-19 | RN-14, RN-12 |
| CA-22 | **CR-02** Sin horas pasadas y horas en 12 h en toda la interfaz | RF-22 | RN-05 |
| CA-23 | **CR-02** Tablero de reservas del backoffice con tarjeta de detalle | RF-20 | RN-06, RN-07, RN-11, RN-13 |
| CA-24 | **CR-02** Tablero de pagos con indicadores y desglose por método (incl. Yappy) | RF-21 | RN-07, RN-11, RN-16 |
| CA-25 | **CR-02** El admin configura el % de socios | RF-18 | RN-16, RN-10 |

## CA-01 Ver disponibilidad (RF-01; RN-02, RN-04, RN-08)

- **Dado** el jueves `2026-11-19` con "Fútbol · Media A" reservada de 20:00 a 21:00 y "Pádel 1" en mantenimiento
- **Cuando** el cliente abre la disponibilidad de ese día
- **Entonces** ve una fila por cancha activa y una columna por bloque de 30 min dentro del horario de atención; cada bloque tiene exactamente uno de cuatro estados: `libre`, `ocupado`, `cerrado` (fuera del horario de atención) o `pasado` (bloque ya iniciado); los bloques 20:00 y 20:30 de Media A figuran `ocupado`; "Fútbol · Completa" figura `ocupado` en esos mismos bloques (RN-02); "Pádel 1" no aparece como disponible (RN-08).

## CA-02 Filtro por deporte (RF-02)

- **Dado** la cuadrícula de un día con canchas de fútbol, pádel y básquet
- **Cuando** el cliente filtra por "pádel"
- **Entonces** solo se muestran las canchas de pádel; al quitar el filtro vuelven todas.

## CA-03 Elegir duración y precio (RF-03; RN-03, RN-10)

- **Dado** el cliente con la cuadrícula abierta
- **Cuando** elige duración 1 h, 1 h 30 o 2 h para "Fútbol · Media A"
- **Entonces** el panel "Tu reserva" muestra 50, 75 o 95 USD respectivamente (y 95/140/180 para la completa); no existe otra opción de duración; al cambiar la duración se recalcula qué inicios caben en el horario.

## CA-04 Cliente reserva un turno libre (RF-04, RF-05; RN-01, RN-03, RN-04, RN-05)

- **Dado** un cliente autenticado y "Pádel 1" libre el `2026-11-19` a las 18:00 por 1 h
- **Cuando** confirma la reserva
- **Entonces** se crea una reserva `confirmada` con precio 20 USD y pago `pendiente`, los bloques 18:00 y 18:30 quedan ocupados en la disponibilidad, y aparece en "Mis reservas".

## CA-05 Doble reserva en la misma cancha (RF-04; RN-01)

- **Dado** "Pádel 1" reservada el `2026-11-19` de 18:00 a 19:00
- **Cuando** otro cliente intenta reservar "Pádel 1" ese día de 18:30 a 19:30 (solape parcial), o dos peticiones simultáneas intentan el mismo turno libre
- **Entonces** la petición que choca recibe `409` con el mensaje "Ese horario ya fue tomado. Elige otro."; no se crea reserva ni bloques adicionales; con 10 peticiones concurrentes al mismo turno exactamente 1 tiene éxito.

## CA-06 Mitad contra completa (RF-04; RN-01, RN-02)

- **Dado** "Fútbol · Media A" reservada el `2026-11-19` de 20:00 a 21:00
- **Cuando** un cliente intenta reservar "Fútbol · Completa" de 20:30 a 21:30
- **Entonces** recibe `409` con "Ese horario ya fue tomado. Elige otro."; y a la inversa, con la Completa reservada de 20:00 a 21:00, reservar Media A o Media B en cualquier bloque de ese rango también da `409`; con Media A reservada, Media B sigue reservable en el mismo horario.

## CA-07 Cancelar libera el turno (RF-06; RN-06)

- **Dado** una reserva `confirmada` del cliente que empieza en el futuro
- **Cuando** el cliente la cancela
- **Entonces** su estado pasa a `cancelada`, los bloques vuelven a figurar libres y otro cliente puede reservar ese turno; si la reserva ya empezó, la cancelación se rechaza con `422`; un cliente no puede cancelar reservas de otro (`404`).

## CA-08 Validación de registro (RF-07)

- **Dado** el formulario de registro
- **Cuando** se envía con email inválido, teléfono `"abc"`, contraseña de 7 caracteres, o nombre de menos de 2 caracteres
- **Entonces** responde `400` con `fields` indicando cada campo inválido y no crea usuario; con datos válidos crea la cuenta con rol cliente, responde `201` con el usuario (sin hash de contraseña) y abre sesión mediante la cookie `sid`; un email ya registrado responde `409`.

## CA-09 Inicio de sesión (RF-08)

- **Dado** una cuenta registrada
- **Cuando** inicia sesión con credenciales correctas
- **Entonces** `GET /api/auth/me` devuelve su usuario; con contraseña incorrecta responde `401` sin crear sesión; tras `logout` (`204`), `me` responde `401`; reservar sin sesión responde `401` *(modificado por CR-02: ya no; reservar sin sesión es válido con `guest`, ver CA-19; `GET /api/bookings/mine` sin sesión sigue en `401`)*; una cookie `sid` alterada se trata como sin sesión (`401`).

## CA-10 Admin ve reservas del día (RF-09; RN-06)

- **Dado** un admin autenticado y reservas del `2026-11-19` (confirmada, cancelada, jugada)
- **Cuando** abre "Reservas del día" de esa fecha
- **Entonces** ve una tabla con cancha, hora, cliente (o invitado), estado y pago de cada reserva, y puede cancelar cualquiera de ellas (`200`) liberando sus bloques; cancelar una ya cancelada responde `409`; un cliente que llama a cualquier ruta `/api/admin/*` recibe `403` y sin sesión `401`.

## CA-11 Admin crea reserva para invitado (RF-10; RN-09)

- **Dado** un admin autenticado y "Básquet 1" libre el `2026-11-21` a las 10:00
- **Cuando** crea una reserva con nombre y teléfono de un cliente sin cuenta
- **Entonces** se crea (`201`) una reserva con `createdBy = admin` y datos de invitado, que ocupa los bloques y aparece en "Reservas del día"; si falta nombre o teléfono responde `400`; si el turno choca responde `409`, y si cae fuera de horario o en el pasado responde `422`.

## CA-12 Pago solo después de jugar (RF-11; RN-07, RN-11)

- **Dado** una reserva `confirmada` de "Fútbol · Media A" de 18:00 a 19:00 del `2026-11-19`, precio 50 USD, pago `pendiente`
- **Cuando** el admin registra un pago con `now` = 18:30
- **Entonces** responde `422`, el pago sigue `pendiente` y la reserva no figura en "por cobrar" (aún no es jugada); con `now` = 19:00 o posterior la reserva ya es jugada y aparece en "por cobrar" mientras no se pague; el pago acepta monto (prellenado con 50 USD, ajustable), método (efectivo, transferencia o tarjeta) y quién cobró, y pasa a `pagado` con `paidBy` = admin de la sesión, con lo que sale de `GET /api/admin/payments?status=pending` y aparece en `status=paid`; un segundo pago sobre la misma reserva, o sobre una `cancelada`, responde `409`; monto `0` o método distinto de los tres responde `400`.

## CA-13 No se presentó (RF-12; RN-11)

- **Dado** una reserva jugada, `confirmada`, con pago `pendiente`
- **Cuando** el admin la marca "no se presentó"
- **Entonces** su estado pasa a `no_show`, sale de "por cobrar" y registrar un pago responde `409`; marcarla antes de que termine responde `422`; marcar una que no está `confirmada` responde `409`; la reserva conserva sus bloques.

## CA-14 Configurar canchas, precios, horario y estado (RF-13, RF-14; RN-04, RN-08, RN-10)

- **Dado** un admin autenticado y una reserva existente de "Fútbol · Media A"
- **Cuando** cambia los precios de Media A, recorta su horario del sábado y luego la pone en mantenimiento
- **Entonces** la reserva existente conserva su precio y su horario original; las nuevas reservas usan los precios nuevos, deben caber en el horario nuevo y se rechazan mientras la cancha esté inactiva; una cancha con reservas no puede borrarse (`409`), solo desactivarse; una cancha sin reservas se borra (`204`); el admin puede crear una cancha nueva (p. ej. "Pádel 2", con `id: "padel-2"` y `spaceIds: ["padel-2"]`, espacio que se crea en `spaces` si no existía) y aparece en la disponibilidad con sus precios y horario.

## CA-15 Crear una serie semanal (CR-01; RF-15; RN-12, RN-13)

- **Dado** un cliente autenticado y "Pádel 1" libre los jueves `2026-11-19`, `2026-11-26`, `2026-12-03` y `2026-12-10` a las 20:00
- **Cuando** crea una serie con `courtId = padel-1`, `date = 2026-11-19`, `startTime = 20:00`, `durationMin = 60` y `weeks = 4`
- **Entonces** responde `201` con `{ seriesId, bookings }`: 4 reservas `confirmada`, con el mismo `seriesId`, en las fechas `2026-11-19`, `2026-11-26`, `2026-12-03` y `2026-12-10`, cada una con su propio precio y pago `pendiente`, y las 4 aparecen en "Mis reservas"; `weeks` fuera de 2…8 responde `400`. *(CR-02: sin sesión la serie exige `guest`, ver CA-19; las 4 fechas deben estar dentro de hoy + 30 días, ver CA-21.)*

## CA-16 Serie todo-o-nada ante conflicto (CR-01; RF-15; RN-01, RN-02, RN-12)

- **Dado** un cliente autenticado y "Pádel 1" ya reservada el `2026-12-03` a las 20:00 por otro cliente, y libre las demás fechas
- **Cuando** intenta crear la serie semanal de 4 jueves a las 20:00 desde el `2026-11-19`
- **Entonces** responde `409` con el mensaje "Ese horario ya fue tomado el 2026-12-03. Elige otro." y **no se crea ninguna** reserva (el `2026-11-19`, `2026-11-26` y `2026-12-10` siguen libres); lo mismo aplica al choque por cancha divisible (Media A contra Completa, RN-02); si la fecha que falla incumple horario, está en el pasado o la cancha está inactiva, responde `422` nombrando esa fecha y tampoco se crea ninguna; si una fecha da `422` (p. ej. el `2026-11-26` fuera de horario) y otra `409` (el `2026-12-03` tomada), responde `422` con la fecha `2026-11-26` (las reglas se evalúan antes que los choques) y no se crea ninguna; con dos peticiones concurrentes que se solapan en una fecha, a lo sumo una serie queda creada completa.

## CA-17 Cancelar las próximas de una serie (CR-01; RF-16; RN-06, RN-13)

- **Dado** una serie de 4 jueves del cliente (`2026-11-19` a `2026-12-10`, 20:00) y un `now` del `2026-11-26` a las 21:00 (la 1.ª y la 2.ª ya empezaron)
- **Cuando** el cliente pide "cancelar las próximas" de su serie
- **Entonces** responde `200 { cancelled: 2 }`: la 3.ª y la 4.ª pasan a `cancelada` y liberan sus bloques; la 1.ª y la 2.ª no cambian; otro cliente recibe `404` para una serie ajena; el admin puede hacerlo sobre cualquier serie con la ruta de admin (`401`/`403` sin sesión o sin rol); repetir la acción responde `200 { cancelled: 0 }`; un `seriesId` inexistente responde `404`; cancelar una sola ocurrencia con `POST /api/bookings/:id/cancel` no afecta a las demás.

## CA-18 Admin crea serie para invitado y cada ocurrencia se cobra aparte (CR-01; RF-15; RN-09, RN-07, RN-12, RN-13)

- **Dado** un admin autenticado y "Básquet 1" libre tres sábados (`2026-11-21`, `2026-11-28`, `2026-12-05`) a las 10:00 de 60 minutos
- **Cuando** crea una serie de 3 semanas con `guest = { name, phone }` y luego, con `now = 2026-11-20` al crear y luego `now = 2026-11-21 11:30` (la 1.ª ya terminó), registra el pago de esa ocurrencia
- **Entonces** responde `201` con 3 reservas `createdBy = admin` y datos de invitado con el mismo `seriesId`; falta de nombre o teléfono responde `400`; solo la 1.ª pasa a `pagado` y las otras dos siguen `pendiente` (la 2.ª sigue sin poder cobrarse hasta que termine, `422`); un choque en cualquiera de las fechas responde `409` con la fecha y no crea ninguna.

## CA-19 Reservar sin cuenta (CR-02; RF-17; RN-15, RN-01..RN-05)

- **Dado** un visitante sin sesión y "Pádel 1" libre el `2026-11-19` a las 18:00 por 1 h
- **Cuando** reserva indicando `guest = { name: "Ana Pérez", phone: "+507 6000 1234" }`
- **Entonces** `POST /api/bookings` responde `201` con una reserva `confirmada`, `guest` con esos datos, `createdBy = client`, `discountPct = 0`, `price = basePrice = 20` y pago `pendiente`; los bloques 18:00 y 18:30 quedan ocupados; sin `guest`, con nombre de 1 carácter o con teléfono `"abc"` responde `400` con `fields` por campo y no crea nada; el choque sigue siendo `409` "Ese horario ya fue tomado. Elige otro."; lo mismo vale para `POST /api/bookings/series` (con `guest`, `201`; sin `guest`, `400`); con sesión de cliente, `guest` se ignora y la reserva queda a nombre del usuario; `GET /api/bookings/mine` y cancelar sin sesión siguen respondiendo `401`; en la web, el panel «Tu reserva» pide nombre y teléfono cuando no hay sesión y muestra los errores por campo en español.

## CA-20 Socio con sesión recibe descuento (CR-02; RF-18; RN-16, RN-10)

- **Dado** el descuento de socios en 10 % y un cliente autenticado, y "Fútbol · Media A" libre el `2026-11-19` a las 20:00
- **Cuando** reserva 60 minutos con sesión y luego el admin cambia el descuento a 20 %
- **Entonces** la reserva queda con `basePrice = 50`, `discountPct = 10` y `price = 45`; la reserva existente conserva esos valores tras el cambio (RN-10) y una reserva nueva con sesión usa `discountPct = 20` y `price = 40`; una reserva sin sesión conserva `discountPct = 0` y `price = 50`; en la web el panel «Tu reserva» muestra «Socio: −10 %» y el precio con descuento solo con sesión (lee `GET /api/settings/loyalty`), y el login/registro se presenta como «Club de socios» con la tarjeta del formulario separada del encabezado (margen superior ≥ 32 px a 1280 y a 390 px de ancho).

## CA-21 Horizonte de 30 días (CR-02; RF-19; RN-14, RN-12)

- **Dado** un `now` = `2026-11-17 10:00` (hoy + 30 días = `2026-12-17`) y "Pádel 1" libre
- **Cuando** se reserva el `2026-12-17` (límite) y el `2026-12-18` (hoy + 31)
- **Entonces** la del `2026-12-17` responde `201`; la del `2026-12-18` responde `422` "Solo se puede reservar hasta 30 días de anticipación." y no crea nada; una serie semanal de 4 desde el `2026-12-03` (4.ª ocurrencia el `2026-12-24`) responde `422` nombrando la fecha `2026-12-24` y no crea ninguna; el mismo límite aplica al admin; la web ofrece 31 días desde hoy en la tira (desplazable) y el selector de fecha (`<input type="date">`) con `min` = hoy y `max` = hoy + 30.

## CA-22 Sin horas pasadas y horas en 12 h (CR-02; RF-22; RN-05)

- **Dado** hoy a las 15:10 y "Pádel 1" con atención desde las 08:00
- **Cuando** el cliente (o el admin al crear una reserva) abre la cuadrícula de hoy y elige duración
- **Entonces** los bloques que ya iniciaron figuran deshabilitados (`pasado`) y no se pueden elegir, y la duración no puede empezar en el pasado (la API también rechaza con `422`); todas las horas visibles se muestran en 12 h (`8:00 a. m.`, `12:00 p. m.`, `8:00 p. m.`, `12:30 a. m.`) en cliente y backoffice, mientras la API devuelve `HH:MM`; las fechas largas salen como «jueves 12 de noviembre de 2026».

## CA-23 Tablero de reservas del backoffice (CR-02; RF-20; RN-06, RN-07, RN-11, RN-13)

- **Dado** un admin autenticado y, el `2026-11-19`, una reserva confirmada, una jugada, una `no_show` y una cancelada, además de otras reservas en días distintos
- **Cuando** abre `/admin` (pestaña **Reservas**) y elige ese día
- **Entonces** ve una fila por cancha activa y una columna por bloque de 30 min, con cada reserva como una barra que abarca sus bloques (nombre corto y hora en 12 h); la tira de 31 días marca con un punto los días con reservas no canceladas (`GET /api/admin/bookings/calendar`); al pasar el cursor, enfocar con teclado o tocar una barra se abre una tarjeta accesible (`role="dialog"`) con nombre, teléfono, fecha larga, horario, cancha, precio (y descuento si hubo), estado (confirmada / jugada / no se presentó / cancelada), pago (con método y monto, o pendiente), «Terminó» / «En curso» / «Por jugar» y serie si aplica, con las acciones cobrar (monto prellenado y método efectivo/transferencia/tarjeta/yappy), no se presentó, cancelar y cancelar las próximas de la serie; la cancelada no ocupa bloques y se lista bajo el tablero; un bloque libre abre «Nueva reserva» para invitado; en 390 px el tablero se desplaza dentro de su caja.

## CA-24 Tablero de pagos e indicadores (CR-02; RF-21; RN-07, RN-11, RN-16)

- **Dado** un admin autenticado y reservas jugadas pagadas por método (efectivo 50, transferencia 75, tarjeta 20, yappy 45), una por cobrar de 30, una `no_show` y una cancelada en el rango del `2026-11-16` al `2026-11-22`
- **Cuando** cambia a la pestaña **Pagos** (`?vista=pagos`, sin cambiar de página) y elige semana
- **Entonces** el mismo tablero se muestra con las barras coloreadas por pago (pagado / por cobrar / no aplica) y `GET /api/admin/payments/summary?from=2026-11-16&to=2026-11-22` devuelve `collected = 190`, `pending = 30`, `pendingCount = 1`, `noShow = 1`, `cancelled = 1`, `byMethod = { efectivo: 50, transferencia: 75, tarjeta: 20, yappy: 45 }` y `byDay` con el cobrado por día; `occupancyPct` = bloques reservados / bloques abiertos de canchas activas; la vista muestra los indicadores (total cobrado, por cobrar, reservas, ocupación %, no-shows), el desglose por método con monto y % y el cobrado por día; un pago por `yappy` responde `200`; `calendar` y `summary` responden `403` a un cliente y `401` sin sesión.

## CA-25 El admin configura el % de socios (CR-02; RF-18; RN-16, RN-10)

- **Dado** el descuento de socios en su valor inicial (10) y un admin autenticado
- **Cuando** lo cambia a 15 con `PUT /api/admin/settings/loyalty` (o con el ajuste del backoffice) y luego intenta 51, `-1` y `10.5`
- **Entonces** el 15 responde `200 { discountPct: 15 }` y `GET /api/settings/loyalty` (público) lo devuelve; 51, `-1` y `10.5` responden `400` y el valor no cambia; 0 y 50 son válidos; un cliente recibe `403` y sin sesión `401`; las reservas ya hechas no cambian (RN-10) y las nuevas con sesión usan el 15 %.

## Prueba prevista por CA (ciclos 2, 3 y 4)

Cada CA tiene al menos una prueba prevista. El detalle y el estado viven en `docs/testing.md`.
Integración de API = `bun test` sobre `createApp` con BD de prueba y `now` inyectado (tarea 6);
e2e = Playwright (tarea 9, `tests/e2e/*.e2e.ts`, cada prueba nombra sus CA).

| CA | Prueba prevista en API (tarea 6) | Prueba prevista e2e (tareas 7–9) |
|---|---|---|
| CA-01 | `GET /api/availability`: cuatro estados, Completa ocupada con Media A, cancha inactiva ausente, `400` fecha inválida | cuadrícula del jueves |
| CA-02 | — (filtro de interfaz) | filtrar por pádel y quitar el filtro |
| CA-03 | precio calculado por el servidor para 60/90/120 | panel "Tu reserva" |
| CA-04 | `POST /api/bookings` `201`, `GET /api/bookings/mine` | reservar Pádel 1 y ver "Mis reservas" |
| CA-05 | choque parcial `409` con mensaje exacto; 10 concurrentes vía HTTP, 1 éxito | segundo cliente recibe el aviso |
| CA-06 | Media A vs Completa `409` y a la inversa; Media B libre | — |
| CA-07 | cancelar `200`, ajena `404`, ya cancelada `409`, ya empezada `422`; turno reservable de nuevo | cancelar desde "Mis reservas" |
| CA-08 | registro `201`, `400` con `fields` por campo, `409` email repetido | formulario de registro |
| CA-09 | login `200`/`401`, `me`, logout `204`, cookie alterada `401`, reservar sin sesión `401` | iniciar y cerrar sesión |
| CA-10 | `GET` y cancelar admin; `401`/`403` en todas las rutas `/api/admin/*` | tabla "Reservas del día" |
| CA-11 | invitado `201`, `400`, `409`, `422` | crear reserva para invitado |
| CA-12 | pago con `now` 18:30 `422` y 19:00 `200`; segundo pago `409`; listas `pending`/`paid`; `amount` 0 `400` | registrar cobro |
| CA-13 | no-show `200`, antes de terminar `422`, luego pago `409`, ya no está en `pending` | marcar "no se presentó" |
| CA-14 | PUT precios/horario/inactiva y reserva existente intacta; `DELETE` con reservas `409`, sin reservas `204`; crear "Pádel 2" con espacio nuevo | edición de cancha en backoffice |
| CA-15 *(CR-01)* | `POST /api/bookings/series` `201` con 4 reservas, mismo `seriesId`, fechas +7, precio por ocurrencia; `weeks` 1 y 9 `400`; `401` sin sesión | reservar serie y verla en "Mis reservas" |
| CA-16 *(CR-01)* | choque en la 3.ª fecha `409` con mensaje exacto y 0 reservas creadas; Media A vs Completa; `422` por fecha pasada o inactiva con la fecha; series concurrentes solapadas, 1 completa | segundo cliente recibe el aviso con la fecha |
| CA-17 *(CR-01)* | `cancel-future` con `now` intermedio `200 { cancelled: 2 }`, ajena `404`, admin cualquiera, repetir `{ cancelled: 0 }`, bloques liberados | "Cancelar las próximas" desde "Mis reservas" |
| CA-18 *(CR-01)* | admin `POST /api/admin/bookings/series` invitado `201`, `400`, `409`; pago de una ocurrencia no cambia las otras | crear serie para invitado y cobrar una ocurrencia |
| CA-19 *(CR-02)* | `POST /api/bookings` y `/series` sin sesión: `201` con `guest`, `400` sin `guest`/nombre corto/teléfono inválido, `409` choque, con sesión `guest` ignorado, `mine` sin sesión `401` | reservar sin iniciar sesión (errores por campo en español) |
| CA-20 *(CR-02)* | sesión de cliente Media A 60 min, 10 % → `basePrice` 50, `price` 45; sin sesión 50; cambiar a 20 % no altera la previa; serie con descuento por ocurrencia | «Socio: −10 %» y precio con descuento; «Club de socios» y margen del formulario ≥ 32 px (1280 y 390) |
| CA-21 *(CR-02)* | `now` fijo: hoy+30 `201`, hoy+31 `422` con mensaje exacto; serie con 4.ª ocurrencia fuera `422` nombrando la fecha y 0 creadas; admin igual | tira de 31 días y `<input type="date">` con `min`/`max` |
| CA-22 *(CR-02)* | `formatTime12`/`formatLongDate` (unit); `422` por pasado se mantiene | bloques iniciados de hoy deshabilitados; horas en 12 h en cliente y backoffice |
| CA-23 *(CR-02)* | `GET /api/admin/bookings/calendar` cuenta por día sin canceladas, `400` rango > 62, `403` cliente; `GET /api/admin/bookings?date=` incluye canceladas con `basePrice`/`discountPct` | tablero, puntos en la tira, tarjeta (hover/foco/toque), acciones y canceladas bajo el tablero |
| CA-24 *(CR-02)* | `GET /api/admin/payments/summary` suma por método (incl. `yappy`), pendientes, no-shows, `byDay`, `occupancyPct`; pago `yappy` `200`; `401`/`403` | pestaña Pagos (`?vista=pagos`), indicadores y desglose por método |
| CA-25 *(CR-02)* | `PUT /api/admin/settings/loyalty` 15 `200`, 51/`-1`/10.5 `400`, `GET` público, `403`/`401`; reservas previas intactas | ajuste del % en el backoffice |
