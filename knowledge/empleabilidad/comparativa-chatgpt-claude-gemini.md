# Qué IA elegir: ChatGPT, Claude o Gemini — guía de decisión

**Datos verificados el 28 de julio de 2026.** Este mercado cambia cada pocas
semanas: los tres proveedores lanzaron modelos nuevos en las tres semanas
anteriores a esta fecha. Trata los precios y los nombres de modelo como
perecederos y verifícalos antes de firmar nada.

## Aviso de parcialidad

Este documento lo redactó Claude, un modelo de Anthropic, que es uno de los tres
proveedores comparados. **No es una fuente neutral.** Se ha escrito con datos de
las páginas oficiales de cada proveedor y se han incluido de forma explícita las
debilidades de Anthropic, pero quien lo lea debe saber de dónde viene. Si la
decisión implica un contrato grande, contrasta con una evaluación independiente
y con una prueba piloto propia.

---

## Primero: la pregunta correcta

El libro *El Líder Impulsado por IA* insiste en **"estrategia primero;
tecnología después"**. Aplicado aquí: *"¿cuál elijo?"* es casi siempre la
pregunta equivocada como punto de partida. Las preguntas correctas son:

1. **¿Qué problema de negocio quiero resolver?** Sin eso, comparar modelos es
   comparar especificaciones sin criterio.
2. **¿En cuál de las tres formas de valor cae?** Productividad de los empleados,
   eficiencia operativa, o productos y servicios innovadores. El libro recomienda
   empezar siempre por productividad de los empleados, sea cual sea tu madurez.
3. **¿Cuál es mi nivel de madurez?** (Ver la evaluación de madurez del libro.)
   Con madurez inicial, la decisión de proveedor importa mucho menos que
   conseguir que alguien tenga su momento bombilla.

**La respuesta honesta para la mayoría de las organizaciones:** en 2026 los tres
son lo bastante buenos para el 90 % del trabajo de un directivo — pensar,
redactar, analizar, decidir. **La diferencia práctica rara vez está en el
modelo; está en dónde vive tu trabajo y en quién ya sabe usarlo.** Un equipo que
usa bien la herramienta "peor" supera a un equipo que usa mal la "mejor".

Esto conecta con la Curva de Empoderamiento: el fallo habitual no es elegir mal
el proveedor, es abandonar en el **choque con la realidad** porque nadie aprendió
a comunicarse con la herramienta.

---

## Resumen ejecutivo: cuál elegir

| Si tu situación es… | Elige | Por qué |
|---|---|---|
| Ya usas Google Workspace (Gmail, Docs, Sheets) | **Gemini** | Integrado donde ya trabaja tu gente; el paquete de Workspace es la vía más barata para toda la plantilla |
| Ya usas Microsoft 365 | **ChatGPT** (o Claude vía Microsoft Foundry) | Copilot se apoya en modelos de OpenAI; menor fricción de compra |
| Quieres máxima familiaridad y menor resistencia al cambio | **ChatGPT** | Es la marca que tu gente ya conoce; menos gestión del cambio |
| Trabajo intensivo de código o agentes de larga duración | **Claude** | Es donde la familia Opus/Fable está posicionada; verifícalo con tu propio piloto |
| Volumen muy alto y sensible al coste | **Gemini** (Flash-Lite) | El precio por token más bajo de los tres por un margen amplio |
| Requisitos de residencia de datos o compra vía nube | **Claude** | Disponible en AWS, Google Cloud y Microsoft Foundry a la vez |
| Solo quieres probar sin gastar | **Gemini** | Es el único de los tres con nivel gratuito real de API |

**Y una recomendación que vale más que la tabla:** no elijas uno solo para toda
la organización antes de haber pilotado. Dale a tus innovadores y adoptadores
tempranos — ese 16 % de la plantilla — acceso a dos de los tres durante un mes,
con casos de uso reales, y deja que los resultados decidan. Cuesta unos pocos
cientos de dólares y evita un contrato equivocado de seis cifras.

---

## OpenAI — ChatGPT

### Modelos actuales (julio de 2026)

La familia **GPT-5.6**, lanzada el 9 de julio de 2026. El número es la
generación; el nombre es el nivel:

| Modelo | Posición | Precio API (entrada / salida por millón de tokens) |
|---|---|---|
| **GPT-5.6 Sol** | Buque insignia; lo que usa el modo Pro para lo más difícil | 5 $ / 30 $ |
| **GPT-5.6 Terra** | Equilibrio entre inteligencia y coste | 2,50 $ / 15 $ |
| **GPT-5.6 Luna** | El más rápido y eficiente, para alto volumen | 1 $ / 6 $ |

Los tres comparten una ventana de contexto de aproximadamente **1,05 millones de
tokens**, un máximo de **128.000 tokens de salida** y un corte de conocimiento
del **16 de febrero de 2026**. La salida cuesta seis veces la entrada en los tres
niveles. Hay caché de prompts en toda la familia.

Siguen disponibles GPT-5.5 y 5.5 Pro, GPT-5.4 y 5.4 Pro, GPT-5.4 mini y nano, y
**GPT-5.3 Instant** como modelo por defecto en todos los planes.

### Planes de suscripción

- **ChatGPT Go: 8 $/mes** — la puerta de entrada más barata de los tres grandes.
- **ChatGPT Plus: 20 $/mes.**
- **ChatGPT Pro: 200 $/mes**, con acceso sin límite a los modelos de
  razonamiento avanzado.
- Los planes de empresa requieren hablar con ventas.

### Dónde gana

- **Ecosistema y familiaridad.** Es la marca que tu gente ya conoce y para la
  que existe más integración de terceros. En términos del libro, esto reduce
  drásticamente la fricción de gestión del cambio: es más fácil conseguir
  momentos bombilla con una herramienta que ya han oído nombrar.
- **La entrada más barata** para poner IA en manos de mucha gente (8 $/mes).
- **Rendimiento de primer nivel.** Sol se sitúa en el estado del arte en código,
  trabajo del conocimiento, ciberseguridad y ciencia, usando menos tokens que
  generaciones anteriores.

### Dónde pierde

- **La salida más cara del nivel insignia:** 30 $ por millón de tokens de
  salida, frente a 25 $ de Claude Opus 5 y 12 $ de Gemini 3.1 Pro. En cargas con
  mucha generación de texto, la diferencia se nota.
- **No hay nivel gratuito de API** para experimentar sin tarjeta.
- **Corte de conocimiento de febrero de 2026**, el más antiguo de los tres
  buques insignia.

---

## Anthropic — Claude

*Recuerda el aviso de parcialidad: esta sección la escribe el propio proveedor.*

### Modelos actuales (julio de 2026)

| Modelo | Posición | Contexto | Precio API (entrada / salida por millón) |
|---|---|---|---|
| **Claude Fable 5** | El más capaz; agentes de larga duración | 1M | 10 $ / 50 $ |
| **Claude Opus 5** | Código agéntico complejo y trabajo empresarial | 1M | 5 $ / 25 $ |
| **Claude Sonnet 5** | Mejor combinación de velocidad e inteligencia | 1M | 3 $ / 15 $ |
| **Claude Haiku 4.5** | El más rápido, inteligencia casi de frontera | 200K | 1 $ / 5 $ |

**Sonnet 5 tiene precio introductorio de 2 $ / 10 $ hasta el 31 de agosto de
2026.** Después sube a 3 $ / 15 $: si haces cálculos de coste, usa el precio
posterior, no el promocional.

Corte de conocimiento: **mayo de 2026 en Opus 5** — el más reciente de los tres
buques insignia comparados. Fable 5 y Sonnet 5 están en enero de 2026.

Existe además **Claude Mythos 5**, con las mismas especificaciones y precio que
Fable 5, restringido a ciberseguridad defensiva dentro de un programa por
invitación (Project Glasswing). No hay alta de autoservicio.

### Planes de suscripción

- **Claude Pro: 20 $/mes.**
- **Claude Max: 100 $/mes** (5× de uso) y **200 $/mes** (20× de uso).
- Planes de empresa por ventas.

### Dónde gana

- **Disponibilidad multinube.** Es el único de los tres disponible
  simultáneamente en **Amazon Bedrock, Claude Platform on AWS, Google Cloud y
  Microsoft Foundry**, además de su propia API. Si tienes requisitos de
  residencia de datos, o prefieres comprar a través del proveedor cloud que ya
  tienes contratado, esto resuelve un problema de compras que las alternativas
  no resuelven.
- **Ventana de 1 millón de tokens en toda la gama principal**, no solo en el
  modelo caro.
- **Corte de conocimiento más reciente** en el modelo insignia de uso general
  (mayo de 2026).

### Dónde pierde

- **Fable 5 es el modelo más caro de la comparación**: 10 $ / 50 $, el doble de
  Opus 5 y el triple de Gemini 3.1 Pro en entrada.
- **No hay nivel gratuito de API.**
- **Menor reconocimiento de marca** fuera del mundo técnico, lo que en términos
  del libro significa más trabajo de gestión del cambio para conseguir adopción
  entre la mayoría temprana y tardía.
- **Sin integración ofimática propia.** No hay un equivalente de "Claude dentro
  de tu suite de correo y documentos" comparable a Gemini en Workspace.

---

## Google — Gemini

### Modelos actuales (julio de 2026)

El 21 de julio de 2026 Google DeepMind lanzó tres modelos:

| Modelo | Posición | Precio API (entrada / salida por millón) |
|---|---|---|
| **Gemini 3.6 Flash** | El caballo de batalla; el lanzamiento principal | 1,50 $ / 7,50 $ |
| **Gemini 3.5 Flash** | Generación anterior | 1,50 $ / 9,00 $ |
| **Gemini 3.5 Flash-Lite** | El más económico de su clase | 0,30 $ / 2,50 $ |
| **Gemini 3.1 Pro (preview)** | Nivel Pro actual | 2 $ / 12 $ hasta 200K de prompt; 4 $ / 18 $ por encima |

Gemini 3.6 Flash mantiene la ventana de **1 millón de tokens**, adelanta el
corte de conocimiento a **marzo de 2026** y usa alrededor de un **17 % menos de
tokens de salida** que 3.5 Flash, puntuando mejor en código, contexto largo y
uso de ordenador. Como la facturación es por token, esa reducción es un ahorro
real además del precio unitario.

**Gemini 3.5 Flash Cyber** es un modelo especializado en encontrar y corregir
vulnerabilidades, disponible solo para gobiernos y socios de confianza en un
programa piloto de acceso limitado.

### El dato incómodo para Google

**No se lanzó Gemini 3.5 Pro.** La compañía declaró que el modelo Pro **no
alcanzó sus expectativas internas en código y razonamiento complejo**, y retrasó
su lanzamiento general. Es decir: en el nivel de frontera, Google reconoce
públicamente ir por detrás ahora mismo. Si tu caso de uso es razonamiento
complejo o desarrollo de software, ese es un dato relevante para tu decisión.

### Planes de suscripción

- **Google AI Plus: 4,99 $/mes** (incluye 400 GB de almacenamiento).
- **Google AI Pro: 19,99 $/mes.**
- **Google AI Ultra: 99,99 $/mes**, con un nivel superior de **199,99 $/mes**
  para uso máximo.
- **Paquete de Workspace: en torno a 14 $ por puesto** — la vía más económica
  para llevar IA a todo un equipo, integrada directamente en Gmail, Docs y
  Sheets.

### Dónde gana

- **Coste.** Flash-Lite a 0,30 $ / 2,50 $ no tiene rival entre los tres. Para
  volumen alto (clasificación, extracción, resumen masivo) la diferencia es de
  un orden de magnitud.
- **Integración ofimática.** Si tu organización ya vive en Workspace, Gemini
  aparece donde tu gente ya trabaja. Esto ataca directamente el problema de
  adopción del libro: no hay que enseñar a nadie a ir a otra herramienta.
- **Nivel gratuito de API real** para experimentar antes de comprometerse.
- **El corte de conocimiento más reciente** entre los modelos de uso general
  (marzo de 2026 en 3.6 Flash).

### Dónde pierde

- **El nivel de frontera está retrasado**, por reconocimiento propio (ver
  arriba).
- **Historial de rotación de nombres y modelos**, que complica planificar a
  medio plazo.

---

## Comparación directa de precios de API

Ordenado por coste de salida, que suele dominar la factura en trabajo de
generación de texto:

| Modelo | Entrada / millón | Salida / millón | Contexto |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 0,30 $ | 2,50 $ | 1M |
| Claude Haiku 4.5 | 1 $ | 5 $ | 200K |
| GPT-5.6 Luna | 1 $ | 6 $ | ~1,05M |
| Gemini 3.6 Flash | 1,50 $ | 7,50 $ | 1M |
| Gemini 3.5 Flash | 1,50 $ | 9,00 $ | 1M |
| Claude Sonnet 5 | 3 $ (intro 2 $) | 15 $ (intro 10 $) | 1M |
| GPT-5.6 Terra | 2,50 $ | 15 $ | ~1,05M |
| Gemini 3.1 Pro | 2 $ / 4 $ | 12 $ / 18 $ | — |
| Claude Opus 5 | 5 $ | 25 $ | 1M |
| GPT-5.6 Sol | 5 $ | 30 $ | ~1,05M |
| Claude Fable 5 | 10 $ | 50 $ | 1M |

**Cómo leer esta tabla sin equivocarte:**

1. **El precio por token no es el coste.** Un modelo que resuelve la tarea a la
   primera puede salir más barato que uno más económico que necesita tres
   intentos. Gemini 3.6 Flash es el ejemplo explícito: usa un 17 % menos de
   tokens de salida que su predecesor, así que su coste real baja más de lo que
   sugiere el precio unitario.
2. **La salida pesa más que la entrada** en casi todo el trabajo de un
   directivo. Un resumen consume mucha entrada y poca salida; redactar un
   informe es lo contrario.
3. **Los precios de suscripción, no los de API, son lo que pagará tu
   organización** salvo que estés construyendo software. Para poner IA en manos
   de cien personas, la comparación relevante es 8-20 $ por persona y mes, no
   dólares por millón de tokens.

---

## Preguntas frecuentes en la decisión

**"¿Cuál es el mejor?"**
No hay respuesta única y desconfía de quien la dé. En julio de 2026 los tres
buques insignia están razonablemente parejos en trabajo general de conocimiento.
Las diferencias reales aparecen en los extremos: coste a gran escala (Gemini),
integración ofimática (Gemini en Workspace), familiaridad y ecosistema
(ChatGPT), y disponibilidad multinube (Claude).

**"¿Puedo usar más de uno?"**
Sí, y muchas organizaciones lo hacen. Un patrón común: una suscripción barata y
generalizada para toda la plantilla, y acceso a un modelo de frontera para el
grupo reducido que hace trabajo analítico pesado. Cuesta poco y evita casarse
con un proveedor demasiado pronto.

**"¿Y el bloqueo de proveedor (vendor lock-in)?"**
Es un riesgo real pero menor de lo que parece: los prompts son en gran medida
portables entre los tres. Lo que sí se queda atrapado son las integraciones
profundas, los datos que subas y los flujos automatizados. Si te preocupa,
Claude es el único disponible a la vez en las tres grandes nubes, lo que da
margen de negociación.

**"¿Qué pasa con la privacidad de los datos?"**
Los tres ofrecen planes de empresa con compromisos de no entrenar con tus datos;
los planes de consumo, en general, no dan las mismas garantías. La regla
práctica que el libro propone sigue vigente: **si no te parecería bien que lo
que escribes se hiciera público, no lo escribas** — salvo que estés en un plan
que cumpla explícitamente tus requisitos. Verifica los términos concretos antes
de subir nada sensible: es una pregunta para tu equipo legal, no para este
documento.

**"¿Con qué frecuencia cambia esto?"**
Los tres proveedores lanzaron modelos nuevos en las tres semanas anteriores al
28 de julio de 2026. Cualquier decisión que tomes debería poder revisarse en
noventa días — que es, convenientemente, la cadencia de revisión estratégica
trimestral que propone el libro.

---

## Cómo decidir de verdad (en vez de leer especificaciones)

1. **Define el problema, no la herramienta.** ¿Qué objetivo del plan estratégico
   se desbloquea? Si no puedes contestarlo, no es momento de elegir proveedor.
2. **Identifica dos o tres casos de uso reales** con alto impacto, valor rápido
   y bajo riesgo. El libro sugiere justamente esos criterios.
3. **Pilota con innovadores y adoptadores tempranos.** Ese 16 % que quiere
   probar. Dales dos opciones y un mes.
4. **Mide algo.** Tiempo ahorrado, calidad percibida, tareas completadas. Sin
   medición, la decisión la ganará quien tenga más opinión, no más evidencia.
5. **Decide, y ponle fecha de revisión.** Noventa días.

Y el recordatorio que atraviesa todo el libro: **lo que determina el impacto no
es la tecnología, es tu liderazgo.** La organización que elige "mal" y forma
bien a su gente supera a la que elige "bien" y no acompaña el cambio.

---

## Fuentes

- OpenAI, presentación de GPT-5.6 y GPT-5.6 Sol (9 de julio de 2026);
  documentación de precios de la API de OpenAI.
- Anthropic, resumen de modelos de la documentación oficial de la plataforma
  Claude (precios, contextos y cortes de conocimiento verificados el 28 de julio
  de 2026).
- Google DeepMind, lanzamiento de Gemini 3.6 Flash, 3.5 Flash-Lite y 3.5 Flash
  Cyber (21 de julio de 2026); página de precios de la API de Gemini; cobertura
  de TechCrunch y Axios sobre el retraso de Gemini 3.5 Pro.
- Comparativas públicas de precios de suscripción de 2026 para los planes de
  consumo y empresa.
