# Agentes: qué son, en qué se diferencian, y cuándo se justifican

Escrito el 2026-08-18. Documento de criterio. La palabra "agente" se usa hoy para
cosas bastante distintas según quién la diga, incluido el marketing de productos
que son asistentes con otro nombre. Lo que sigue describe el mecanismo, que es lo
que permite reconocer cuál es cuál.

## La diferencia con un asistente

Un asistente responde. Tú preguntas, contesta, y ahí termina su turno.

Un agente actúa en ciclo. Recibe un objetivo, decide por su cuenta cuál es el
siguiente paso, usa una herramienta, mira el resultado, y vuelve a decidir. Sigue
así hasta que considera cumplido el objetivo o hasta que algo lo detiene.

Las dos palabras que hacen la diferencia son **decide** y **herramienta**. Decide:
tú no le diste los pasos, le diste el destino. Herramienta: puede leer un archivo,
buscar en internet, escribir en un sistema, mandar algo. Un modelo que solo
escribe texto no es un agente por muy bueno que sea el texto.

## Por qué eso cambia el problema entero

Con un asistente, lo peor que puede pasar es que la respuesta sea mala y tú la
uses sin revisarla. El error es tuyo y es un error de una vez.

Con un agente, lo peor que puede pasar es que haga diez cosas, cada una razonable
a partir de la anterior, y la décima sea un desastre que nadie miró. El error se
compone y se ejecuta.

Por eso, en un agente, **los permisos no son un detalle de configuración: son el
diseño**. La pregunta interesante deja de ser "¿qué tan bueno es el modelo?" y
pasa a ser "¿qué le dejé hacer?".

## Las tres preguntas de permisos

**¿Qué puede leer?** Y en consecuencia, qué información puede terminar en un
lugar donde no debía. Un agente con acceso a toda la unidad compartida tiene
acceso a la carpeta de remuneraciones.

**¿Qué puede modificar?** Un agente que solo lee y propone es una categoría
distinta de riesgo que uno que escribe. La mayoría de los casos útiles en una
empresa se resuelven con leer y proponer.

**¿Qué puede hacer que no se pueda deshacer?** Mandar un correo, borrar un
archivo, emitir un pago, publicar algo, escribir a un cliente. Esta es la lista
corta que hay que mirar de verdad, y la respuesta correcta al principio es
"nada": lo irreversible lo aprieta una persona.

A eso se le llama el radio de daño. Lo que se diseña no es lo que el agente hará
bien, es lo que puede llegar a hacer mal.

## Qué necesita para que valga la pena

**Un objetivo verificable.** "Ordena la carpeta según estas reglas" se puede
comprobar. "Mejora la comunicación del equipo" no, y un agente con un objetivo
que no se puede comprobar corre hasta que se le acaba el presupuesto.

**Pasos reversibles.** Ver arriba.

**Un final.** Tiene que existir una condición de término explícita: cuando pasó
esto, para. Sin eso, un agente que se equivoca no se equivoca una vez, insiste.

**Alguien que firme.** Una persona identificable que revisa la salida antes de
que tenga efecto en el mundo. Mientras el agente sea nuevo, esa persona mira
todo; después, muestras.

## Dónde se justifican hoy, y dónde no

Se justifican donde el trabajo es de muchos pasos parecidos, cada paso es
reversible, y el resultado se puede comprobar. Revisar cien documentos contra una
lista de criterios y marcar los que se salen. Recorrer un sistema juntando datos
dispersos y armar un resumen. Preparar borradores que después alguien aprueba.

No se justifican cuando la tarea es un solo paso — ahí un asistente hace lo mismo
con menos riesgo —, cuando cada paso necesita criterio humano de todas formas, o
cuando lo que haría es irreversible y caro. Un agente para una tarea de un paso
es complejidad sin beneficio, y es la forma más común de perder tiempo con esto.

## Cómo describir uno para tu campo

Sirve como ejercicio y sirve como especificación real. Cinco líneas:

1. **El objetivo**, en una frase que se pueda comprobar.
2. **Las herramientas** que necesita, nombradas: qué sistema lee, dónde escribe.
3. **Lo que tiene permitido**, explícito.
4. **Lo que no tiene permitido**, más explícito todavía, empezando por lo
   irreversible.
5. **Cuándo para**, y a quién le entrega.

Si al escribirlo la lista 4 queda vacía, el ejercicio no está terminado.

## Lo que hay que saber sin que nadie lo pregunte

Un agente hereda todo lo que falla en un asistente: inventa cuando no sabe,
suena igual de seguro cuando acierta y cuando no, y no distingue lo importante de
lo secundario si nadie se lo dijo. Ninguna de esas cosas se arregla dándole
herramientas. Se arreglan con lo mismo de siempre: contexto suficiente, un
objetivo comprobable, y alguien que revise.

La diferencia es que ahora esas fallas tienen manos.
