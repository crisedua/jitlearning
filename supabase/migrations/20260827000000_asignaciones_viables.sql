-- Las tres asignaciones, puestas donde el precio las aguanta.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
--   Gratis     20 -> 10 minutos   (una clase)
--   Fundador  300 -> 30 minutos   (tres clases al mes)
--   Estándar  300 -> 60 minutos   (seis clases al mes)
--
-- ## Por qué
--
-- Un minuto hablado cuesta $0.152 (docs/pricing.md §1). Con las asignaciones
-- viejas, un suscriptor que usara lo que se le vendió costaba $45.60 y pagaba
-- $8.44. Ninguna de las dos tarifas sobrevivía a su propio cliente ideal, que es
-- la peor forma de estar roto: mientras mejor funciona el producto, más caro
-- sale cada persona que lo quiere.
--
-- A uso completo, ahora:
--
--   Fundador  30 min = $4.56 de costo  contra  $8.44 netos
--   Estándar  60 min = $9.12 de costo  contra $18.15 netos
--   Gratis    10 min = $1.52, que es costo de adquisición y no de servicio
--
-- Es la primera versión de esta escalera que gana plata con alguien que agota su
-- plan, en vez de depender de que no lo agote.
--
-- ## Supersede a 20260826000000_fundador_60_minutos.sql
--
-- Esa migración dejaba Fundador en 60 y nunca llegó a correrse. Se mantiene en
-- el historial en vez de reescribirse: las migraciones son un registro, y el
-- orden por nombre hace que 30 gane sobre 60 cuando se pega el paquete completo.
-- Su razonamiento sigue siendo válido y sigue siendo el mismo; lo que cambió es
-- cuánta plata se está dispuesto a perder a uso completo, que resultó ser
-- ninguna.
--
-- ## La promesa ya baja sola
--
-- `weeklyTaskPhrase` en src/lib/plans.ts deriva la frase de `monthly_minutes`,
-- así que la tarjeta y el párrafo de /progreso siguen a estos números sin tocar
-- código. Con Fundador bajo una clase por semana la frase deja de ser semanal y
-- pasa a ser mensual — "3 tareas al mes, una por clase" — porque "cada semana"
-- sería una promesa que tres clases no pueden sostener.
--
-- Los `blurb` son la excepción: son texto libre en la base y nada puede
-- derivarlos. Por eso los dos que nombraban una cifra o una cadencia se cambian
-- acá, y el de Gratis deja de nombrar minutos del todo.
--
-- ## Estándar deja de estar dominado
--
-- 30 < 60, así que `dominatedBy` ya no esconde su botón. Las dos tarifas se
-- pueden comprar.
--
-- Nadie ha comprado todavía, que es el momento en que bajar una asignación no
-- le cuesta confianza a nadie.

do $$
declare
  touched int;
begin
  update public.plans
     set monthly_minutes = 10,
         -- Decía "20 minutos para resolver una tarea…", que es exactamente el
         -- tipo de número que se queda viejo solo. Ahora nombra la clase.
         blurb = 'Una clase para resolver una tarea de tu semana y medir lo que ahorra.'
   where id = 'free';
  get diagnostics touched = row_count;
  if touched = 0 then
    raise exception 'No hay ningún plan con id ''free''.';
  end if;

  update public.plans
     set monthly_minutes = 30
   where id = 'founder';
  get diagnostics touched = row_count;
  if touched = 0 then
    raise exception 'No hay ningún plan con id ''founder''. Los ids están en src/lib/plans.ts (free, founder, standard).';
  end if;

  update public.plans
     set monthly_minutes = 60,
         -- Decía "Estudio diario", y seis clases al mes no son diarias.
         blurb = 'Una clase por semana, con memoria entre sesiones.'
   where id = 'standard';
  get diagnostics touched = row_count;
  if touched = 0 then
    raise exception 'No hay ningún plan con id ''standard''.';
  end if;
end $$;
