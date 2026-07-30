# Riesgos, privacidad y equidad

Este documento existe porque casi todos los riesgos de la IA en un colegio son
invisibles mientras ocurren. Nadie se entera de que un dato salió, ni de que una
respuesta estaba sesgada, ni de que un estudiante dejó de pensar.

## Datos de menores: la regla que hay que fijar primero

UNESCO fue directa en su guía de septiembre de 2023: la ausencia de regulación
nacional sobre IA generativa en la mayoría de los países "deja la privacidad de
los datos de los usuarios desprotegida y a las instituciones educativas en gran
medida sin preparación para validar las herramientas". Traducido: nadie te va a
avisar. El colegio decide o el colegio se expone.

**Lo que no debería salir del establecimiento hacia una herramienta externa:**

- Nombres de estudiantes junto a información sobre su desempeño o conducta.
- Diagnósticos, informes psicológicos, psicopedagógicos o de necesidades
  educativas especiales.
- Situaciones familiares, vulneraciones, medidas de protección.
- Notas individuales identificables, listas de curso completas.
- Datos de contacto de apoderados.

**El error de la falsa anonimización.** Quitar el nombre no anonimiza. "El
estudiante de 7°B que repitió el año pasado y vive con su abuela" identifica a
una persona en un colegio de mil. La prueba práctica: si un profesor del colegio
pudiera adivinar de quién se habla, no está anónimo.

**Preguntas que hay que hacerle a cualquier proveedor**, antes de firmar:
¿dónde se almacenan los datos?, ¿se usan para entrenar modelos?, ¿por cuánto
tiempo se conservan?, ¿qué pasa si el colegio se va?, ¿hay cuentas
institucionales separadas de las personales? Una herramienta gratuita sin
respuesta clara a la segunda pregunta se paga con los datos de los estudiantes.

## Consentimiento: informar antes, no después

La guía *PotencIA el Aprendizaje* (Mineduc, Fundación Chile y CENIA, marzo de
2025) establece que la implementación debe promover **transparencia y
consentimiento informado de estudiantes y apoderados**.

En la práctica esto significa una comunicación antes de empezar, en lenguaje
normal, que diga: qué herramienta se va a usar, para qué, con qué curso, qué
información va a manejar y a quién preguntarle dudas. Un apoderado que se entera
por su hijo asume lo peor, y tiene razón en asumirlo.

## Los usos que otros ya prohibieron

El Reglamento Europeo de IA no rige en Chile, pero marca dónde puso el límite el
regulador más estricto:

- **Reconocimiento de emociones: prohibido** en instituciones educativas y en el
  trabajo desde el 2 de febrero de 2025, salvo por razones médicas o de
  seguridad. Cubre software que infiera del rostro o la voz si un estudiante
  está distraído, aburrido o ansioso. El fundamento declarado es la asimetría de
  poder: el estudiante no está en posición de negarse.
- **Alto riesgo, con supervisión humana obligatoria** (Anexo III): sistemas que
  determinan admisión o asignación de estudiantes, que evalúan resultados de
  aprendizaje, que determinan el nivel educativo apropiado, y la supervisión
  automatizada de exámenes.

Aunque no sea obligatorio aquí, es una buena vara: **si una decisión afecta la
trayectoria de un estudiante, tiene que haber una persona que la explique.** No
"el sistema lo determinó".

## Sesgo: el riesgo que no se ve

*PotencIA el Aprendizaje* advierte que las respuestas pueden ser incorrectas,
imprecisas o sesgadas, y que pueden **reproducir estereotipos de género**.
UNESCO agrega, en su lista de riesgos: seguridad, privacidad, derechos de autor,
manipulación, ampliación de brechas y **pérdida de diversidad de opiniones**.

Lo específico del contexto escolar: el material que produce un modelo lo entrega
un adulto con autoridad, en un contexto donde el estudiante no está en posición
de contradecirlo. Un ejemplo sesgado en una guía de matemáticas no se discute:
se resuelve.

Mitigación realista: revisión humana de todo material antes de entregarlo, y
enseñar explícitamente a los estudiantes que la herramienta se equivoca, con
ejemplos reales de errores encontrados en ese mismo colegio.

## Dependencia: el riesgo con evidencia

No es especulación. En el estudio de Bastani y otros (PNAS, 2025) con cerca de
1.000 estudiantes de matemáticas en Turquía, quienes practicaron con acceso
irrestricto a GPT-4 rindieron después **17% peor** que quienes nunca lo tuvieron.
La explicación de los autores es que lo usaron como muleta: practicaron con la
respuesta al lado y no hicieron el esfuerzo que produce aprendizaje.

La mitigación que el mismo estudio valida: salvaguardas —pistas en vez de
respuestas— y práctica que termina en evaluación sin herramienta.

## Equidad: la brecha nueva

UNESCO incluye la "ampliación de brechas" entre los riesgos, y en un colegio
chileno se concreta en tres formas:

1. **Acceso desigual fuera del aula.** Quien tiene buen plan de datos y computador
   en la casa practica con una herramienta que su compañero no tiene. Si se
   evalúa el producto final, se está evaluando el acceso.
2. **Las versiones de pago son mejores.** No es marginal, y se nota en los
   resultados.
3. **Brecha de criterio.** Los estudiantes con más apoyo en casa aprenden a
   desconfiar de las respuestas; los demás las copian. Esta es la brecha que el
   colegio sí puede cerrar, y por eso enseñar a evaluar críticamente no es un
   contenido "blando": es la parte redistributiva del asunto.

## La lista mínima de verificación

Antes de que cualquier curso empiece a usar IA con estudiantes:

- [ ] Está escrito qué información no puede salir del colegio.
- [ ] Los apoderados fueron informados antes de empezar.
- [ ] Hay una persona con nombre a cargo, y todos saben quién es.
- [ ] Ninguna decisión sobre un estudiante se toma sin revisión humana.
- [ ] Todo material generado se revisa antes de entregarse.
- [ ] Se enseñó primero a detectar errores del modelo.
- [ ] Hay una fecha para revisar si esto sigue teniendo sentido.
