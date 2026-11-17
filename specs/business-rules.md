# Reglas de negocio

## Conceptos

- **Espacio:** superficie física que no puede usarse dos veces al mismo tiempo (`futbol-media-a`, `futbol-media-b`, `padel-1`, `basquet-1`).
- **Cancha:** unidad reservable que el cliente elige; ocupa uno o más espacios.
- **Bloque:** 30 minutos; índice desde 00:00 (`"20:00"` → 40).

| Cancha | Deporte | Espacios que ocupa | Formato |
|---|---|---|---|
| Fútbol · Media A | fútbol | media-a | 5vs5 |
| Fútbol · Media B | fútbol | media-b | 5vs5 |
| Fútbol · Completa | fútbol | media-a + media-b | 7vs7 |
| Pádel 1 | pádel | padel-1 | — |
| Básquet 1 | básquet | basquet-1 | — |

## Precios (USD)

| Cancha | 1 h | 1 h 30 | 2 h |
|---|---|---|---|
| Media cancha 5vs5 | 50 | 75 | 95 |
| Cancha completa 7vs7 | 95 | 140 | 180 |
| Pádel *(provisional)* | 20 | 30 | 40 |
| Básquet *(provisional)* | 30 | 45 | 60 |

Pádel y básquet son valores de ejemplo, editables en el backoffice. El precio se copia a la reserva
al crearla.

## Reglas

- **RN-01 Sin doble reserva:** un espacio no puede tener dos reservas activas que se solapen en ningún bloque de 30 min.
- **RN-02 Cancha divisible:** reservar la completa ocupa ambas mitades; si cualquiera de las mitades está ocupada en un bloque, la completa no está disponible en ese bloque.
- **RN-03 Duraciones:** solo 60, 90 o 120 minutos; inicio en múltiplos de 30 min.
- **RN-04 Horario de atención:** la reserva debe caber completa dentro del horario de atención de la cancha para ese día de la semana. Por defecto *(provisional)*: L–V 16:00–23:00, S–D 08:00–23:00.
- **RN-05 Sin pasado:** no se reserva un turno que ya empezó.
- **RN-06 Cancelación:** el cliente cancela su reserva antes de que empiece; el admin puede cancelar cualquiera. Cancelar libera los bloques.
- **RN-07 Pago post-juego:** el pago solo puede registrarse cuando la reserva terminó; registra monto, método (efectivo, transferencia, tarjeta) y quién cobró.
- **RN-08 Cancha inactiva:** una cancha en mantenimiento no aparece disponible; no se pueden crear reservas nuevas en ella.
- **RN-09 Reserva por el admin:** el admin crea reservas para clientes sin cuenta (nombre y teléfono obligatorios), sujetas a las mismas reglas RN-01 a RN-05 y RN-08.
- **RN-10 Cambios de configuración** *(decisión del diseñador)*: cambiar precios, horario o poner en mantenimiento afecta solo a reservas nuevas; las existentes se conservan y el admin las cancela a mano si hace falta. Una cancha con reservas no se borra, solo se desactiva.
- **RN-11 No se presentó** *(decisión del diseñador)*: el admin puede marcar una reserva jugada como "no se presentó"; sale de "por cobrar" y no admite pago. El monto del pago se prellena con el precio y el admin puede ajustarlo (descuento); no hay pagos parciales.
- **RN-12 Serie todo-o-nada** *(CR-01)*: una serie semanal tiene entre 2 y 8 ocurrencias; la ocurrencia *k* (k = 0…n−1) cae en `fecha + 7·k` días, a la misma hora y duración. Cada ocurrencia se valida con RN-01 a RN-05 y RN-08 (y RN-09 si la crea el admin). Si **cualquiera** choca o incumple una regla, **no se crea ninguna** y el error nombra la fecha: choque → `409` "Ese horario ya fue tomado el <YYYY-MM-DD>. Elige otro."; horario, pasado o cancha inactiva → `422` que nombra la fecha. Se evalúan en orden de fecha y se informa la primera que falla.
- **RN-13 Ocurrencias independientes** *(CR-01)*: cada ocurrencia es una reserva propia con el `seriesId` de la serie; se calcula su precio por separado (RN-10), se cancela por separado (RN-06) y se cobra por separado (RN-07, RN-11). "Cancelar las próximas" cancela solo las ocurrencias `confirmadas` que aún no empezaron: el cliente solo en sus propias series, el admin en cualquiera. Las ocurrencias ya jugadas, `no_show` o ya canceladas no se modifican.

## Estados de una reserva

`confirmada` → (`cancelada` | `no_show`). `confirmada` con hora de fin pasada se muestra como
**jugada** (derivado del reloj, no es un estado guardado). Pago: `pendiente` → `pagado`.
"Por cobrar" = jugada, no cancelada ni `no_show`, y pago pendiente.

## Usuarios *(decisión del diseñador)*

El cliente crea una cuenta (nombre, email, teléfono, contraseña) para reservar y ver "Mis reservas".
El admin es un rol sembrado al iniciar. Sesión con cookie firmada (httpOnly).
