# Datos: análisis sobre tus propias planillas, y cuándo no creerle

Escrito el 2026-08-18. Documento de criterio. Los nombres de las funciones y de
los menús cambian entre herramientas y entre versiones; lo que no cambia es la
diferencia del apartado siguiente, que es donde está casi todo el riesgo.

## La distinción que decide si el número sirve

Cuando le das una planilla a un asistente, puede pasar una de dos cosas, y desde
fuera se ven casi iguales.

**Una: lee los números como texto y razona sobre ellos.** Los "ve" como parte de
la conversación y produce una respuesta que suena a análisis. Para describir,
resumir o encontrar un patrón grueso, funciona. Para un total, un promedio o un
conteo, es donde aparecen las cifras inventadas: no sumó, estimó lo que parecía
una suma razonable. Y una suma inventada se ve idéntica a una suma correcta.

**Dos: escribe código que calcula sobre el archivo y te muestra el resultado.**
Acá sí hubo una operación. Cuenta las filas de verdad, suma la columna de verdad,
y el código que usó se puede leer y volver a correr.

**La regla práctica: para cualquier cosa que sea un número, exige la segunda.**
Si la herramienta puede ejecutar código sobre tus archivos, ese es el modo que
quieres. Si no puede, entonces los números que te dé no son resultados, son
impresiones bien redactadas, y hay que tratarlos así.

## Cómo saber en cuál de las dos estás

Pregúntalo directamente: "¿calculaste esto o lo estimaste?". Y pide ver la
operación: la fórmula, el código, o los pasos. Una respuesta que no puede mostrar
cómo llegó al número no calculó nada.

La otra señal, más rápida: dale algo cuyo resultado ya sabes. Si tu planilla tiene
1.240 filas y le preguntas cuántas filas tiene, la respuesta es inmediata y
verificable. Una herramienta que se equivoca en eso no va a acertar en el margen
por producto.

## Antes de subir nada

Esto va antes que el análisis, siempre. Una planilla de trabajo suele traer más
de lo que crees: nombres, rut o documentos de identidad, correos, sueldos,
direcciones, datos de clientes.

- Borra las columnas que no necesitas para la pregunta que estás haciendo. La
  mayoría de los análisis no necesitan saber quién es cada fila.
- Reemplaza los identificadores por códigos si necesitas distinguir filas pero
  no saber de quién son.
- Si son datos de terceros, la pregunta no es si la herramienta es segura, es si
  tienes permiso para sacarlos de donde están.

Una planilla anonimizada responde las mismas preguntas de negocio que la original
en casi todos los casos. Cuando no las responde, ese es el momento de consultar,
no de subir el archivo completo y ver qué pasa.

## Las preguntas que sí se contestan bien

Las que tienen una respuesta comprobable y acotada: cuántos, cuánto suma, cuál es
el más alto, qué filas cumplen esta condición, cómo se ve esto agrupado por mes.
Y las de forma: qué columnas hay, qué falta, dónde hay datos inconsistentes,
qué duplicados existen. La limpieza de datos es de las cosas donde estas
herramientas rinden más y donde el error se nota antes.

## Las que hay que mirar con desconfianza

**"¿Por qué bajaron las ventas?"** Con la planilla sola, esto no tiene respuesta.
Lo que devuelve es una lista de hipótesis plausibles presentadas como hallazgos.
Sirven como lista de qué mirar; no sirven como conclusión.

**Cualquier proyección.** Extender una serie hacia adelante es fácil de escribir
y difícil de justificar. Si vas a usarla, tiene que quedar dicho qué supuesto la
sostiene.

**Comparaciones entre cosas que no son comparables.** Si dos columnas tienen
unidades distintas, meses distintos o criterios de carga distintos, el modelo va a
compararlas igual y no va a avisarte, porque eso está en el contexto del negocio
y no en el archivo.

## La comprobación mínima, siempre

Tres cosas, y toman menos de lo que parece:

1. **Un número que ya conoces.** Pídele algo cuyo resultado tengas a mano y
   compara. Si no cuadra, nada de lo demás cuadra.
2. **Dos o tres filas al azar.** Toma lo que afirmó sobre un caso concreto y ábrelo
   en la planilla. Es donde aparecen los errores de interpretación de columnas.
3. **Los totales tienen que sumar.** Si te dio un desglose, súmalo tú y compáralo
   con el total que te dio. Cuando no cuadran, casi siempre falta una categoría
   que quedó fuera sin aviso.

## Lo que se queda contigo

El resultado del análisis se usa esta vez. Lo que sirve la próxima es otra cosa:
la pregunta bien escrita, la comprobación que hiciste para creerle, y saber en
qué modo estabas trabajando. Eso es lo que se guarda y se vuelve a usar, y es
independiente de qué herramienta uses el año que viene.
