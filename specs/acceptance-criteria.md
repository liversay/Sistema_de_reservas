# Criterios de aceptación

Formato Dado / Cuando / Entonces. La numeración CA-01…CA-14 es **estable**: las tareas, pruebas y
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
| CA-09 | Inicio de sesión | RF-08 | — |
| CA-10 | Admin ve reservas del día | RF-09 | RN-06 |
| CA-11 | Admin crea reserva para invitado | RF-10 | RN-09 |
| CA-12 | Pago solo después de jugar | RF-11 | RN-07, RN-11 |
| CA-13 | No se presentó | RF-12 | RN-11 |
| CA-14 | Configurar canchas, precios, horario y estado | RF-13, RF-14 | RN-04, RN-08, RN-10 |

## CA-01 Ver disponibilidad (RF-01; RN-02, RN-04, RN-08)

- **Dado** el jueves `2026-11-19` con "Fútbol · Media A" reservada de 20:00 a 21:00 y "Pádel 1" en mantenimiento
- **Cuando** el cliente abre la disponibilidad de ese día
- **Entonces** ve una fila por cancha activa y una columna por bloque de 30 min dentro del horario de atención; los bloques 20:00 y 20:30 de Media A figuran ocupados; "Fútbol · Completa" figura no disponible en esos mismos bloques (RN-02); "Pádel 1" no aparece como disponible (RN-08).

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
- **Entonces** responde `400` indicando el campo inválido y no crea usuario; con datos válidos crea la cuenta con rol cliente y abre sesión; un email ya registrado responde `409`.

## CA-09 Inicio de sesión (RF-08)

- **Dado** una cuenta registrada
- **Cuando** inicia sesión con credenciales correctas
- **Entonces** `GET /api/auth/me` devuelve su usuario; con contraseña incorrecta responde `401` sin crear sesión; tras `logout`, `me` responde `401`; reservar sin sesión responde `401`.

## CA-10 Admin ve reservas del día (RF-09; RN-06)

- **Dado** un admin autenticado y reservas del `2026-11-19` (confirmada, cancelada, jugada)
- **Cuando** abre "Reservas del día" de esa fecha
- **Entonces** ve una tabla con cancha, hora, cliente (o invitado), estado y pago de cada reserva, y puede cancelar cualquiera de ellas liberando sus bloques; un cliente que llama a `/api/admin/*` recibe `403` y sin sesión `401`.

## CA-11 Admin crea reserva para invitado (RF-10; RN-09)

- **Dado** un admin autenticado y "Básquet 1" libre el `2026-11-21` a las 10:00
- **Cuando** crea una reserva con nombre y teléfono de un cliente sin cuenta
- **Entonces** se crea una reserva con `createdBy = admin` y datos de invitado, que ocupa los bloques; si falta nombre o teléfono responde `400`; si el turno choca responde `409`, y si cae fuera de horario o en el pasado responde `422`.

## CA-12 Pago solo después de jugar (RF-11; RN-07, RN-11)

- **Dado** una reserva `confirmada` de 60 USD de 18:00 a 19:00 del `2026-11-19`
- **Cuando** el admin registra un pago con `now` = 18:30
- **Entonces** responde `422` y el pago sigue `pendiente`; con `now` = 19:00 o posterior acepta monto (prellenado con el precio, ajustable), método (efectivo, transferencia o tarjeta) y quién cobró, y el pago pasa a `pagado`; un segundo pago sobre la misma reserva responde `409`; la reserva aparece en "por cobrar" antes del pago y en "cobrados" después.

## CA-13 No se presentó (RF-12; RN-11)

- **Dado** una reserva jugada, `confirmada`, con pago `pendiente`
- **Cuando** el admin la marca "no se presentó"
- **Entonces** su estado pasa a `no_show`, sale de "por cobrar" y registrar un pago responde `409`; marcarla antes de que termine responde `422`.

## CA-14 Configurar canchas, precios, horario y estado (RF-13, RF-14; RN-04, RN-08, RN-10)

- **Dado** un admin autenticado y una reserva existente de "Fútbol · Media A"
- **Cuando** cambia los precios de Media A, recorta su horario del sábado y luego la pone en mantenimiento
- **Entonces** la reserva existente conserva su precio y su horario original; las nuevas reservas usan los precios nuevos, deben caber en el horario nuevo y se rechazan mientras la cancha esté inactiva; una cancha con reservas no puede borrarse (`409`), solo desactivarse; el admin puede crear una cancha nueva (p. ej. "Pádel 2").
