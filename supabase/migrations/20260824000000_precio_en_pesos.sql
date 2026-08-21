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

-- `founder`, no `fundador`. El id del plan está en inglés y solo el nombre que
-- se muestra está en español, y la primera versión de esta migración usó el
-- nombre: actualizó cero filas, Postgres respondió UPDATE 0 sin error, y la
-- página siguió mostrando "Conversemos" con el SQL "ya corrido". El bloque de
-- abajo existe para que eso no pueda volver a pasar en silencio.
do $$
declare
  touched int;
begin
  update public.plans
     set mp_price_minor = 9900
   where id = 'founder';

  get diagnostics touched = row_count;

  if touched = 0 then
    raise exception
      'No hay ningún plan con id ''founder'', así que el precio en pesos no se puso. Los ids están en src/lib/plans.ts (free, founder, standard).';
  end if;
end $$;

-- Estándar (id `standard`) también, aunque su tarjeta no tenga botón.
--
-- `dominatedBy` la deja sin acción mientras Fundador siga abierto, para que
-- nadie tome el peor de dos planes iguales, y esa parte no cambia. Lo que sí
-- cambia es que ahora la página cobra en pesos: sin un precio acá, la tarjeta de
-- Estándar quedaba en dólares al lado de un botón en pesos, y el visitante no
-- tenía contra qué comparar los $9.900 que efectivamente va a pagar. El precio
-- de lista solo sirve si está en la misma moneda que el precio con descuento.
--
-- 19.990. Cuando Fundador se cierre, este es el número que queda vigente y el
-- que va a cobrarse de verdad, así que vale mirarlo de nuevo ese día.
do $$
declare
  touched int;
begin
  update public.plans
     set mp_price_minor = 19990
   where id = 'standard';

  get diagnostics touched = row_count;

  if touched = 0 then
    raise exception
      'No hay ningún plan con id ''standard'', así que el precio de lista en pesos no se puso.';
  end if;
end $$;

-- Y Gratis en cero, que no es un precio sino la última moneda que quedaba
-- mezclada.
--
-- Con Fundador y Estándar en pesos, la tarjeta de Gratis seguía diciendo "US$0"
-- al lado de "$9.900". Cero es cero en cualquier moneda, así que el número no
-- cambia; lo que cambia es que la página deja de mostrar dos símbolos distintos
-- en la misma fila, que era todo el problema.
--
-- No abre ninguna puerta: `mpPurchasablePlan` rechaza cualquier plan con
-- `mp_price_minor <= 0`, y la tarjeta de Gratis devuelve "Empezar gratis" antes
-- de llegar a mirar un botón de pago.
update public.plans
   set mp_price_minor = 0
 where id = 'free';
