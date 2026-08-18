# Encadenar: de una tarea suelta a un flujo que se repite

Escrito el 2026-08-18. Este documento es de criterio, no de botones: no lleva
precios, nombres de plan ni versiones de modelo, porque esa es la parte que
caduca y para eso está la búsqueda en vivo. Lo que hay acá sigue siendo cierto
cuando cambie la herramienta.

## Qué es encadenar

Encadenar es partir una tarea en pasos donde la salida de cada uno es la entrada
del siguiente, en vez de pedirlo todo de una vez.

El ejemplo más común en cualquier oficio: en vez de "escríbeme el informe mensual
a partir de estas notas", son cuatro pasos. Extraer los hechos de las notas.
Ordenarlos por tema. Redactar el borrador con esa estructura. Revisar el borrador
contra una lista de comprobación.

## Por qué el flujo gana a la petición gigante

No es que el modelo entienda mejor. Es que tú puedes mirar.

**Cada paso se verifica solo.** Si el informe salió mal, con una petición gigante
no sabes en qué se equivocó. Con cuatro pasos, miras la salida del primero y ves
que faltaba un hecho, y ese es todo el problema.

**El error no se propaga en silencio.** Un dato mal extraído en el paso 1
aparece redactado con seguridad en el paso 3, y a esa altura suena a conclusión.
Revisar el paso 1 cuesta un minuto; descubrir el error en la versión final que ya
mandaste cuesta bastante más.

**El paso que funciona se guarda.** Una petición gigante que salió bien es
irrepetible: no sabes qué parte la hizo funcionar. Un paso escrito y guardado se
vuelve a usar la semana siguiente sin volver a pensarlo.

**Puedes cambiar un solo eslabón.** Cuando cambie la plantilla del informe,
cambias el paso 3 y los otros tres siguen igual.

## Cómo se arma uno, en concreto

**Primero, dilo en voz alta como se lo explicarías a alguien que entra mañana.**
"Saco los datos de acá, los ordeno así, escribo esto, y antes de mandarlo reviso
aquello." Esa frase ya es el flujo. Si no puedes decirla, todavía no tienes un
flujo, tienes una intención.

**Segundo, decide el formato del traspaso entre pasos.** Es la parte que la
gente salta y es la que decide si el flujo se sostiene. Si el paso 1 devuelve
prosa suelta, el paso 2 tiene que volver a interpretarla y ahí es donde se
pierden cosas. Pídele al paso 1 que devuelva una lista con campos fijos, o una
tabla con columnas que tú nombraste. Un traspaso con forma es un flujo; un
traspaso en prosa es una conversación larga.

**Tercero, marca dónde miras tú.** No en todos los pasos: en los que, si salen
mal, arruinan lo que viene después. Normalmente es la extracción de datos y el
paso final antes de que salga de tus manos.

**Cuarto, córrelo entero una vez con un caso real tuyo** y anota dónde tuviste
que corregir a mano. Esas correcciones son la siguiente versión del flujo: casi
siempre significan que a un paso le faltaba contexto o que el formato del
traspaso era demasiado libre.

## Dónde se rompen los flujos

**El contexto se pierde entre pasos.** Cada paso empieza sabiendo solo lo que le
diste. Si el paso 3 necesita saber para quién es el informe, hay que decírselo
en el paso 3, aunque lo hayas dicho en el paso 1.

**El paso de más.** Un flujo de nueve pasos no es más fino, es más frágil: cada
paso es una oportunidad de que algo se desvíe, y nueve pasos son nueve
oportunidades. Si dos pasos siempre salen bien juntos, son un paso.

**La deriva silenciosa.** El flujo sigue funcionando y la salida se va pareciendo
cada vez menos a lo que querías, porque cambió la entrada y nadie lo notó. Por eso
el paso de revisión no se salta cuando el flujo "ya está probado".

**Confundir determinista con criterio.** Sumar una columna, renombrar archivos y
copiar datos entre dos sistemas no necesitan un modelo de lenguaje: son reglas, y
una regla siempre da lo mismo. Deja el modelo para lo que requiere juicio, y haz
lo determinista con lo determinista. Un flujo mezcla las dos cosas y saber cuál
es cuál es la mitad del oficio.

## Cuándo no conviene encadenar

Cuando la tarea no se repite. Un flujo cuesta armarlo, y ese costo se paga con
repeticiones: si vas a hacer esto una vez en la vida, hazlo en una conversación
y sigue.

Cuando cada caso es distinto de verdad. Si el "flujo" tiene que cambiar entero
según el cliente, no es un flujo, es tu criterio, y tu criterio no se automatiza
en esta etapa.

Cuando el resultado no se puede revisar. Si nadie va a mirar la salida y el error
no se nota hasta que es caro, el problema no es la herramienta, es que falta el
punto de revisión.

## Cómo saber que el flujo sirve

La prueba no es que la salida se vea bien. Es que lo corriste dos veces con dos
casos distintos y la segunda vez no tuviste que improvisar nada. Si en la segunda
tuviste que explicarle algo nuevo al modelo, ese algo le falta al flujo escrito.

Y la medida que importa: cuánto tardabas antes en esa tarea y cuánto tardas
ahora, contando la revisión. Un flujo que ahorra veinte minutos de redacción y
te agrega veinticinco de revisión no ahorra nada, y conviene saberlo con el
número, no con la impresión.
