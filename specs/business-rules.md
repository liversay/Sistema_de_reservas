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
al crearla. *(CR-02: se copia como `basePrice` y, con sesión de socio, `price` lleva el descuento vigente `discountPct`, RN-16.)*

## Reglas

- **RN-01 Sin doble reserva:** un espacio no puede tener dos reservas activas que se solapen en ningún bloque de 30 min.
- **RN-02 Cancha divisible:** reservar la completa ocupa ambas mitades; si cualquiera de las mitades está ocupada en un bloque, la completa no está disponible en ese bloque.
- **RN-03 Duraciones:** solo 60, 90 o 120 minutos; inicio en múltiplos de 30 min.
- **RN-04 Horario de atención:** la reserva debe caber completa dentro del horario de atención de la cancha para ese día de la semana. Por defecto *(provisional)*: L–V 16:00–23:00, S–D 08:00–23:00.
- **RN-05 Sin pasado:** no se reserva un turno que ya empezó. *(CR-02: además se aplica en la interfaz, cliente y admin: los bloques ya iniciados del día actual no se pueden elegir y la duración no puede empezar en el pasado; la API sigue rechazando con `422`.)*
- **RN-06 Cancelación:** el cliente cancela su reserva antes de que empiece; el admin puede cancelar cualquiera. Cancelar libera los bloques.
- **RN-07 Pago post-juego:** el pago solo puede registrarse cuando la reserva terminó; registra monto, método (efectivo, transferencia, tarjeta; *CR-02: y yappy*) y quién cobró.
- **RN-08 Cancha inactiva:** una cancha en mantenimiento no aparece disponible; no se pueden crear reservas nuevas en ella.
- **RN-09 Reserva por el admin:** el admin crea reservas para clientes sin cuenta (nombre y teléfono obligatorios), sujetas a las mismas reglas RN-01 a RN-05 y RN-08. *(CR-02: ahora cualquier visitante puede hacerlo sin cuenta, RN-15; la ruta del admin se mantiene y sin descuento.)*
- **RN-10 Cambios de configuración** *(decisión del diseñador)*: cambiar precios, horario o poner en mantenimiento afecta solo a reservas nuevas; las existentes se conservan y el admin las cancela a mano si hace falta. Una cancha con reservas no se borra, solo se desactiva. *(CR-02: también cambiar el % de socios, RN-16, afecta solo a reservas nuevas.)*
- **RN-11 No se presentó** *(decisión del diseñador)*: el admin puede marcar una reserva jugada como "no se presentó"; sale de "por cobrar" y no admite pago. El monto del pago se prellena con el precio y el admin puede ajustarlo (descuento); no hay pagos parciales.
- **RN-12 Serie todo-o-nada** *(CR-01)*: una serie semanal tiene entre 2 y 8 ocurrencias; la ocurrencia *k* (k = 0…n−1) cae en `fecha + 7·k` días, a la misma hora y duración. Cada ocurrencia se valida con RN-01 a RN-05 y RN-08 (y RN-09 si la crea el admin). Si **cualquiera** choca o incumple una regla, **no se crea ninguna** y el error nombra la fecha: choque → `409` "Ese horario ya fue tomado el <YYYY-MM-DD>. Elige otro."; horario, pasado o cancha inactiva → `422` que nombra la fecha. Orden: primero se revisan todas las ocurrencias por reglas (`422`, primera fecha que falla en orden de fecha) y después por choques (`409`, primera fecha que choca en orden de fecha); si hay ambos tipos, responde `422`. *CR-02: con RN-14 (horizonte de 30 días para cada ocurrencia), en la práctica una serie semanal tiene como máximo 5 ocurrencias (hoy, +7, +14, +21, +28); `weeks` 6…8 es válido por esquema pero responde `422` nombrando la fecha que pasa del horizonte.*
- **RN-13 Ocurrencias independientes** *(CR-01)*: cada ocurrencia es una reserva propia con el `seriesId` de la serie; se calcula su precio por separado (RN-10), se cancela por separado (RN-06) y se cobra por separado (RN-07, RN-11). "Cancelar las próximas" cancela solo las ocurrencias `confirmadas` que aún no empezaron: el cliente solo en sus propias series, el admin en cualquiera. Las ocurrencias ya jugadas, `no_show` o ya canceladas no se modifican.
- **RN-14 Horizonte de reserva** *(CR-02)*: la fecha de una reserva (y la de **cada ocurrencia** de una serie) debe ser ≤ hoy + 30 días, con «hoy» = fecha de `now`. Si no, `422` "Solo se puede reservar hasta 30 días de anticipación." (en series, nombrando la fecha de la primera ocurrencia que excede, junto al resto de reglas de RN-12). Se revisa junto a RN-05 en `ruleViolation`. La web ofrece 31 días (hoy … hoy + 30). *Sustituye* el límite de 7 días que mostraba la interfaz antes de CR-02 (nunca fue una regla de la API).
- **RN-15 Reserva sin cuenta** *(CR-02)*: reservar (`POST /api/bookings` y `/series`) no exige sesión. Sin sesión de cliente se exige `guest { name 2–60, phone /^\+?[0-9 ]{7,15}$/ }` (`400` con `fields` si faltan o son inválidos); con sesión de cliente `guest` se ignora y se usa el usuario. Una sesión de admin en estas rutas se trata como sin sesión (el admin usa `/api/admin/bookings`). «Mis reservas» y cancelar desde la web siguen requiriendo cuenta (`401`). *Modifica* la regla anterior «el cliente crea una cuenta para reservar».
- **RN-16 Fidelidad (club de socios)** *(CR-02)*: existe un % de descuento `discountPct` entero 0–50, configurable por el admin (por defecto 10, *provisional*). Una reserva hecha **con sesión de cliente** guarda `basePrice` (precio de lista, RN-10), `discountPct` (el vigente al reservar) y `price = round2(basePrice · (1 − discountPct/100))`; sin sesión `discountPct = 0` y `price = basePrice`. Ejemplo: Media A 60 min, 10 % → `basePrice` 50, `price` 45. Cambiar el % no altera reservas existentes (RN-10). Cada ocurrencia de una serie aplica el % vigente al crearla (RN-13). Las reservas creadas por el admin no llevan descuento. El admin puede ajustar el cobro (RN-11) como siempre.

## Estados de una reserva

`confirmada` → (`cancelada` | `no_show`). *(CR-02: el tablero del backoffice muestra los estados «confirmada», «jugada», «no se presentó» y «cancelada»; las canceladas no ocupan bloques y se listan aparte.)* `confirmada` con hora de fin pasada se muestra como
**jugada** (derivado del reloj, no es un estado guardado). Pago: `pendiente` → `pagado`.
"Por cobrar" = jugada, no cancelada ni `no_show`, y pago pendiente.

## Usuarios *(decisión del diseñador)*

El cliente crea una cuenta (nombre, email, teléfono, contraseña) para ver "Mis reservas", cancelar y obtener el descuento del club de socios (RN-16). *Modificado por CR-02: antes la cuenta era necesaria para reservar; ahora se puede reservar sin cuenta (RN-15).*
El admin es un rol sembrado al iniciar. Sesión con cookie firmada (httpOnly).
