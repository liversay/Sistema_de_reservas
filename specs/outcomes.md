# Outcomes (ODD)

Fase 1 del proyecto: partir del **resultado que queremos para el usuario**, no de la aplicación.
Fuente: `docs/superpowers/specs/2026-11-16-reservas-canchas-design.md` (§1–2).

## Problema

El complejo deportivo coordina las reservas por teléfono o WhatsApp. El cliente no sabe qué está
libre sin preguntar. La cancha de fútbol se alquila completa (7vs7) o por mitades (5vs5), lo que
genera cruces: alguien reserva una mitad mientras otro ya tenía la completa. El cobro se hace
después de jugar y no queda registro claro de quién debe.

## Outcome para el cliente

Ver por sí mismo qué canchas y horarios están libres y reservar en menos de un minuto, sin
intervención del personal.

## Outcome para el administrador

Cero reservas superpuestas; ver el día de un vistazo; registrar cobros después del juego y saber
qué está pendiente de cobro.

## Preguntas ODD

1. ¿Qué información necesita ver el cliente antes de decidir (cancha, hora, duración, precio)?
2. ¿Cuánto tarda hoy un cliente en confirmar una reserva por WhatsApp y qué lo retrasa?
3. ¿Qué tan frecuentes son los cruces de horario y cuál es su causa principal (mitades vs completa)?
4. ¿Qué duraciones se alquilan realmente (1 h, 1 h 30, 2 h) y con qué horas de inicio?
5. ¿Qué pasa cuando un cliente no se presenta? ¿Se cobra, se descuenta, se registra?
6. ¿Cuándo y cómo se cobra hoy, y quién necesita saber qué está pendiente?
7. ¿Debe el cliente poder cancelar solo, y hasta cuándo?
8. ¿El cliente necesita cuenta o basta con nombre y teléfono? ¿Y el cliente que reserva por llamada?
9. ¿Los precios varían por cancha y duración? ¿Quién los cambia y cómo afecta a reservas existentes?
10. ¿Qué horario de atención tiene cada cancha y cómo se maneja el mantenimiento?
11. ¿Habrá más canchas en el futuro (p. ej. Pádel 2) que el admin deba crear sin programador?
12. ¿Qué evidencia necesita el administrador para confiar en que no habrá doble reserva?

## Métricas de éxito

| Métrica | Meta | Cómo se verifica |
|---|---|---|
| Reservas superpuestas | 0 (incluye mitad vs completa y concurrencia) | Suite de doble reserva (CA-05, CA-06), 10 peticiones concurrentes → 1 éxito |
| Tiempo de reserva del cliente | < 1 minuto desde abrir la cuadrícula hasta confirmar | Prueba e2e de CA-04 y cronometraje manual |
| Disponibilidad sin consultar al personal | 100 % de canchas activas visibles por día | CA-01, CA-02 |
| Cobros pendientes visibles | El admin ve "por cobrar" en una sola pantalla | CA-10, CA-12 |
| Pagos registrados antes de jugar | 0 | CA-12 |
| Precio mostrado = precio registrado | 100 % | CA-03, CA-04 (RN-10) |

## No-metas y anti-metas

- No-metas: pago en línea, notificaciones, multi-sede, app nativa, despliegue en la nube.
- Anti-metas: dos reservas cruzadas en el mismo espacio físico; precio mostrado distinto al
  registrado; pago registrado antes de jugar; código sin especificación ni prueba.
