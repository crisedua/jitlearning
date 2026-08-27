-- Fundador baja de 300 minutos a 60, que es lo que su precio financia.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## La aritmética
--
-- Un minuto hablado cuesta $0.152 (docs/pricing.md §1: ElevenLabs $0.080, el
-- modelo $0.056, las búsquedas $0.015). Fundador neto deja unos $8.44 al mes,
-- que financian 56 minutos. Anunciaba 300. Alguien que usara lo que se le
-- vendió costaba $45.60 y pagaba $8.44 — bajo el agua pasado el 19% de su
-- propia asignación.
--
-- 60 y no 120, y no 240. Con `CLASS_CAP_MINUTES = 10`, 60 minutos son seis
-- clases al mes: alrededor de una tarea por semana.
--
-- Eso NO cubre lo que la página prometía. El currículum abre entre 3 y 5 tareas
-- semanales, que al tope son 21 clases al mes, más los otros 3 niveles: 24
-- clases, 240 minutos. Ese es el mínimo que hacía verdadera la frase "alcanza
-- para las 3 a 5 tareas de tu semana", y una prueba en purchase.test.ts existía
-- justamente para no dejar que los dos números se separaran.
--
-- Y 240 minutos cuestan $36.48 al mes contra $8.44 netos. No hay asignación que
-- sea a la vez honesta a ese precio y rentable a uso completo. Así que se movió
-- la promesa en lugar del precio: la tarjeta y el párrafo de /progreso ahora
-- dicen lo que 60 minutos efectivamente compran — una tarea de tu semana, cada
-- semana — derivado de `monthly_minutes` en vez de escrito a mano, que era como
-- se había separado en primer lugar. Ver `weeklyTaskPhrase` en src/lib/plans.ts.
--
-- ## Por qué esto es una migración y no supabase/optional/
--
-- 20260803000000_pricing_tiers.sql inserta los planes con
-- `on conflict (id) do update set monthly_minutes = excluded.monthly_minutes`.
-- El paquete de `npm run sql` se pega entero, así que un UPDATE hecho a mano en
-- la tabla, o un archivo en optional/, vuelve a 300 la próxima vez que alguien
-- pegue el bundle — sin error y sin que nadie lo note. La misma trampa que
-- 20260824000000_precio_en_pesos.sql nombra para el precio. Una migración
-- posterior gana porque el orden es el del nombre del archivo.
--
-- ## Efecto secundario buscado: Estándar recupera su botón
--
-- `dominatedBy` en src/lib/plans.ts esconde la acción de un plan cuando existe
-- otro más barato con al menos tanto de todo lo medido. Con los dos en 300
-- minutos, Estándar era Fundador al doble de precio y la página se negaba a
-- ofrecerlo, para que nadie eligiera el peor de dos planes idénticos. Con
-- Fundador en 60 la dominación desaparece y la tarjeta vuelve a tener botón sin
-- tocar una línea de código, que es exactamente como está escrito que funcione.
--
-- Estándar sigue en 300 minutos y ese número no lo decide este archivo. Su
-- punto de equilibrio son 120.
--
-- ## Es el momento barato
--
-- Nadie ha comprado todavía. Bajar una asignación que nadie contrató no cuesta
-- nada; bajarla después es decirle a un cliente que paga que recibe menos de lo
-- que se le vendió, y eso cuesta más confianza que lo que salva el margen.
--
-- `plans.monthly_minutes` es lo que `checkPlanAllowance` hace cumplir, así que
-- esto rige desde el momento en que se corre. FALLBACK_PLANS en
-- src/lib/plans.ts se actualiza en el mismo commit o la página cita 300 durante
-- una caída de la base.

-- `founder`, no `fundador`: el id está en inglés y solo el nombre mostrado está
-- en español. La primera versión de la migración del precio usó el nombre,
-- actualizó cero filas, Postgres respondió UPDATE 0 sin error y la página siguió
-- igual con el SQL "ya corrido". Este bloque existe para que eso falle fuerte.
do $$
declare
  touched int;
begin
  update public.plans
     set monthly_minutes = 60
   where id = 'founder';

  get diagnostics touched = row_count;

  if touched = 0 then
    raise exception
      'No hay ningún plan con id ''founder'', así que la asignación no se cambió. Los ids están en src/lib/plans.ts (free, founder, standard).';
  end if;
end $$;
