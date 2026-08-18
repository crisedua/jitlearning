# Automatizar: cuándo un flujo deja de ser un chat

Escrito el 2026-08-18. Documento de criterio. No lleva precios, planes ni límites
de las plataformas que nombra: eso cambia seguido y hay que verificarlo en la
página del proveedor antes de decidir nada con esa información.

## La diferencia, en una frase

En un chat, tú abres la herramienta y algo pasa. En una automatización, pasa algo
y la herramienta se abre sola.

Todo lo demás se deriva de eso. Mientras tú estás delante, el error se ve y se
corrige en el momento. Cuando no estás, el error se guarda, se manda o se
propaga, y lo descubre otra persona.

## Las tres preguntas antes de automatizar nada

**¿Se dispara solo?** Tiene que existir un momento identificable que arranque el
proceso sin ti: llega un correo con cierta forma, alguien sube un archivo a una
carpeta, es lunes a las nueve, se creó una fila en una planilla. Si el disparador
es "cuando me acuerdo", todavía no hay nada que automatizar.

**¿La entrada tiene forma?** Una automatización que recibe cualquier cosa produce
cualquier cosa. Si los correos que vas a procesar tienen todos estructuras
distintas, primero hay que resolver eso — a veces con un formulario en vez de un
correo, que es la solución que nadie quiere y casi siempre la correcta.

**¿Qué pasa si sale mal y nadie mira?** Esta es la que decide. Si la respuesta es
"se manda un correo equivocado a un cliente", la automatización termina en un
borrador, no en un envío. Si es "queda una fila rara en una planilla interna",
puede correr sola.

Automatiza hasta donde el error sea barato, y deja que un humano apriete el
último botón mientras no lo sea.

## Con qué se hace, por categorías

Los nombres cambian y las categorías no. Lo que importa es cuál te sirve, no cuál
está de moda.

**Lo que ya está dentro de las herramientas que usas.** Las suites de oficina
traen su propio motor de automatización, y las planillas también. Es lo primero
que hay que mirar y lo último que la gente mira: no agrega una cuenta nueva, no
saca los datos de donde ya están, y para la mitad de los casos alcanza. Si tu
trabajo vive en una planilla, empieza acá.

**Las plataformas de conectores.** Zapier, Make y n8n son las conocidas. Sirven
para lo mismo: unir dos servicios que no se hablan, con condiciones en medio.
"Cuando llegue un correo con adjunto de este remitente, guarda el archivo acá y
agrega una fila allá." Se arman arrastrando bloques y no hace falta programar.
n8n además se puede instalar en un servidor propio, que es la diferencia que
importa cuando los datos no pueden salir de la empresa.

**El modelo como un paso más dentro de eso.** Todas las anteriores pueden
llamar a un asistente de IA en medio del proceso: el paso que clasifica, el que
resume, el que redacta el borrador. Ahí es donde el flujo del documento anterior
se convierte en automatización, un eslabón a la vez.

**Código, cuando ya sabes qué quieres.** Un script pequeño hace lo que tres
bloques arrastrados, corre más barato y se puede leer. Requiere a alguien que lo
mantenga, y esa persona tiene que existir de verdad, no en teoría.

## El orden que funciona

No se automatiza un flujo entero de una vez. Se automatiza el eslabón más aburrido
y más repetido, se deja corriendo una semana, y recién ahí el siguiente.

La razón es práctica: cuando automatizas cinco pasos a la vez y el resultado sale
mal, no sabes cuál falló, y vas a desarmarlo todo. Cuando automatizas uno, el
único sospechoso es ese.

El eslabón por donde empezar casi siempre es el de mover cosas de un lado a otro:
copiar datos, guardar adjuntos, crear la carpeta, avisar que llegó algo. Es la
parte determinista, es la que más se repite, y es la que no necesita criterio.

## Qué tiene que quedar registrado

Una automatización sin registro es una caja negra que funcionó hasta que dejó de
funcionar. Lo mínimo:

- Qué corrió, cuándo, y con qué entrada.
- Qué produjo.
- Qué hizo cuando algo falló, y a quién avisó.

Ese último punto es el que se olvida. Una automatización que falla en silencio es
peor que no tenerla: creías que el trabajo estaba hecho.

## Cuándo no automatizar

**Cuando el proceso todavía está cambiando.** Automatizar congela la versión de
hoy. Si el proceso va a cambiar el mes que viene, automatizarlo ahora es
construir dos veces.

**Cuando pasa poco.** Algo que ocurre dos veces al mes y toma diez minutos son
veinte minutos al mes. Una automatización bien hecha, con su mantención, cuesta
más que eso.

**Cuando el juicio es el trabajo.** Si lo que hace valioso ese paso es que alguien
con experiencia mire y decida, automatizarlo no acelera el trabajo: lo elimina y
lo reemplaza por otro peor.

## Cómo se comprueba que quedó bien

Córrela sobre casos que ya sabes cómo terminaron. Toma diez del mes pasado, pásalos
por la automatización, y compara con lo que efectivamente pasó. Los desacuerdos
son la lista de lo que falta.

Después, déjala corriendo con revisión humana antes de cada salida durante una
o dos semanas. Si en ese tiempo no corregiste nada, recién ahí conviene soltarle
la mano — y solo en la parte donde el error es barato.
