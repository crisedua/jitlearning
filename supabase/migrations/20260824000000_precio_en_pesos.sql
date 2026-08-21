-- El precio de Fundador en pesos, que es lo único que faltaba para cobrar.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- `20260823000000_mercadopago.sql` añadió la columna y la dejó en null a
-- propósito: se negó a inventar un monto a partir de un tipo de cambio, y tenía
-- razón. 8.990 es un precio, 8.743 es una conversión. Pero mientras siguiera en
-- null no aparecía ningún botón, con las dos claves de Mercado Pago puestas, el
-- esquema completo y el despliegue sano — y eso es exactamente lo que estaba
-- pasando: /planes mostraba "Conversemos" y mandaba a cada comprador a WhatsApp.
--
-- 9.900 y no 8.990. Fundador se vende como "precio fijo para siempre", así que
-- este número es un compromiso y no una etiqueta: el que se fije acá hay que
-- poder sostenerlo cuando el peso se mueva, y el margen entre los dos es lo que
-- cuesta esa promesa.
--
-- CLP no tiene unidad menor, así que esto son pesos enteros.
--
-- Esta migración es la fuente de la verdad del precio en pesos. Si cambia, se
-- cambia acá y no a mano en la tabla: el paquete de `npm run sql` se vuelve a
-- pegar entero y un valor puesto a mano se perdería sin que nadie lo notara.

update public.plans
   set mp_price_minor = 9900
 where id = 'fundador';

-- Estándar queda en null a propósito. Mientras Fundador siga abierto, su tarjeta
-- no muestra botón: es el precio de lista contra el que se compara el descuento,
-- y `dominatedBy` la deja sin acción justamente para que nadie tome el peor de
-- los dos. Cuando Fundador se cierre, este es el sitio donde ponerle precio.
