# Construir: cuándo vale la pena una herramienta propia

Escrito el 2026-08-18. Documento de criterio. No lleva precios ni planes de las
plataformas que nombra, y las nombra por lo que hacen y no por su lista de
funciones, que es la parte que cambia sola.

## Primero: casi nunca hay que construir

Esto va al principio a propósito, porque el orden natural del entusiasmo es el
contrario.

La mayoría de los problemas que la gente quiere resolver construyendo algo se
resuelven con una plantilla, una planilla bien armada, un formulario, o una
automatización de dos pasos. Todo eso ya existe, ya funciona, y sobre todo no
hay que mantenerlo.

Construir se justifica cuando se cumplen las tres a la vez:

1. **El proceso ya está estable.** Lo hiciste a mano suficientes veces para saber
   exactamente qué pasos tiene y dónde se rompe. Construir para un proceso que
   todavía estás descubriendo es construir dos veces.
2. **No existe la herramienta, o la que existe no calza.** "No calza" tiene que
   ser concreto: le falta un campo que tu rubro necesita, no habla con el sistema
   donde vive tu trabajo, o cuesta más que el problema.
3. **Lo va a usar alguien más que tú.** Si es solo para ti y ya lo resuelves con
   un chat y una plantilla, construir es un pasatiempo. Legítimo, pero no es esto.

## Qué significa "construir" hoy si no eres programador

Cuatro escalones, de menos a más, y el consejo es siempre empezar por el más
bajo que resuelva el problema.

**Una planilla que se comporta como una aplicación.** Con validación de datos,
listas desplegables, una hoja de entrada separada de la de cálculo, y un botón
que dispara el proceso. Se subestima por lo poco que impresiona. La ventaja
decisiva es que la gente de tu equipo ya sabe abrirla.

**Un formulario más una base.** El formulario captura, la base guarda, y las
vistas muestran. Cubre una cantidad enorme de trabajo real de oficina — pedidos,
solicitudes, seguimientos, inventarios chicos — y no requiere escribir código.
Herramientas como Airtable, Notion o un formulario de Google sobre una planilla
sirven para esto.

**Un constructor de herramientas internas.** Cuando ya hay una base de datos y
lo que falta es una pantalla para que otros la usen sin tocarla por dentro. Acá
empieza a hacer falta alguien que entienda de datos, aunque no escriba código.

**Código, con un asistente.** Es el escalón que cambió de verdad. Con
herramientas como Claude Code, alguien que conoce su oficio y no programa puede
producir algo que funciona describiendo lo que quiere y corrigiendo sobre la
marcha. Lo que no cambió es lo que viene después de que funciona, y eso es el
apartado siguiente.

## La pregunta que decide, y no es técnica

**¿Quién lo va a mantener el mes que viene?**

Todo lo que se construye se rompe: cambia el formato de un archivo, alguien
renombra una columna, el servicio del otro lado cambia algo, se acaba una clave.
Si la respuesta a esa pregunta eres tú y solo tú, acabas de crear un trabajo
permanente para ti mismo, y ese costo no aparece en ninguna parte cuando estás
decidiendo.

Tres consecuencias prácticas:

- **Prefiere lo aburrido.** Una planilla que entiende cualquiera se mantiene; una
  solución elegante que solo tú sabes abrir se abandona el día que te enfermas.
- **Escribe cómo funciona, corto.** Qué hace, qué necesita para andar, qué revisar
  cuando falle. Media página. Sin eso, lo que construiste tiene fecha de
  vencimiento y es el día que cambies de puesto.
- **Que no dependa de tu computador.** "Funciona en mi máquina" no es una
  herramienta, es un favor que haces a mano.

## Lo que hay que construir primero

La versión más chica que otra persona pueda abrir y usar sin que tú estés al lado.

Ese criterio no es modestia, es un test. Fuerza tres cosas que se saltan siempre:
que exista una entrada clara, que la salida se entienda sin explicación, y que
falle de una forma comprensible en vez de quedarse en blanco. Una herramienta que
requiere que tú la presentes no está terminada, está demostrada.

Y es exactamente la prueba que sirve para el portafolio: algo que se puede abrir.

## Los cuatro errores que se repiten

**Construir la versión completa.** Todas las funciones que se te ocurrieron,
antes de que nadie haya usado ninguna. La mitad no se van a usar y no vas a saber
cuál mitad.

**Confundir "funciona" con "está listo".** Anda con tus datos de prueba, en tu
computador, contigo mirando. Falta que ande con los datos raros que trae la
realidad, en el equipo de otra persona, sin ti.

**No decidir qué pasa con los datos.** Dónde quedan, quién los ve, qué pasa si
hay que borrarlos. Si tu herramienta guarda datos de personas o de clientes, esto
es parte de construirla y no un trámite posterior.

**Pedirle criterio a la herramienta.** Si en medio del proceso hay una decisión
que requiere experiencia, el diseño correcto es que la herramienta prepare la
decisión y una persona la tome. Meter el juicio adentro es donde estas cosas
fallan caro.

## Cómo saber si valió la pena

El mismo par de números que el resto del método: cuánto tomaba el proceso antes y
cuánto toma ahora, contando lo que te cuesta mantenerlo. Una herramienta que
ahorra dos horas al mes y te pide una de mantención ahorra una, y conviene saberlo
con el número.

Y una señal que no es un número: alguien la usó sin preguntarte cómo. Eso es lo
que separa una herramienta de una demostración.
