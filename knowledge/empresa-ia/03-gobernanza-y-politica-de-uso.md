# Gobernanza y política de uso en una empresa

## No hay que inventarla desde cero

Existen dos marcos públicos que resuelven la estructura. Ninguno de los dos
obliga en Chile, y los dos sirven como andamio para no escribir una política a
mano y descubrir en seis meses lo que falta.

### NIST AI RMF 1.0 — el marco de trabajo

Publicado por el **NIST** (Estados Unidos) en **enero de 2023**, es voluntario y
organiza la gestión de riesgos de IA en **cuatro funciones** que no son etapas
sino procesos que conviven:

- **Govern (Gobernar).** La función transversal: cultura de gestión de riesgo,
  responsabilidades definidas, políticas, y supervisión a lo largo de todo el
  ciclo de vida. Es donde empieza todo.
- **Map (Mapear).** Situar cada sistema en su contexto de uso e identificar
  impactos técnicos, sociales y éticos. En la práctica: un inventario de dónde
  se está usando IA en la organización, que casi nunca existe.
- **Measure (Medir).** Evaluar y monitorear: qué tan bien funciona, con qué
  errores, con qué sesgos.
- **Manage (Gestionar).** Priorizar y responder: incidentes, deriva del modelo,
  qué se hace cuando algo sale mal.

El NIST publica además un *Playbook* con acciones sugeridas para cada
subcategoría, lo que lo hace usable sin consultoría.

### ISO/IEC 42001:2023 — la norma certificable

Es el estándar internacional de **sistema de gestión de IA (AIMS)**. A
diferencia del NIST, es **certificable**: una entidad acreditada audita y
certifica. Requiere **38 controles agrupados en 9 objetivos de control**, que
cubren evaluaciones de riesgo e impacto, políticas, el ciclo de vida de los
sistemas de IA y la gestión de datos.

La certificación es **voluntaria**, y la propia ISO no certifica: lo hacen
organismos independientes.

**Cuándo tiene sentido perseguirla:** cuando un cliente, una licitación o un
regulador te la va a pedir. No como primer paso, y no para una empresa de veinte
personas que todavía no tiene inventario de en qué está usando IA.

**Regla práctica:** usa el NIST como estructura de trabajo desde el primer día;
mira ISO 42001 cuando alguien externo empiece a preguntar.

## Las siete decisiones que la política tiene que dejar escritas

1. **Qué usos están permitidos, cuáles requieren autorización y cuáles están
   prohibidos.** Tres categorías, no dos: la del medio es la que evita que la
   política se vuelva inaplicable y por lo tanto ignorada.
2. **Qué información no puede salir de la organización.** Datos personales de
   clientes y trabajadores, información sujeta a acuerdos de confidencialidad,
   código propietario, información financiera no pública, antecedentes de salud
   o de procesos disciplinarios. Explícito, en lista.
3. **Qué herramientas están aprobadas y quién aprueba una nueva.** Sin esto, en
   un semestre hay once herramientas, ninguna revisada, varias gratuitas a
   cambio de los datos que se les entregan.
4. **Qué se declara.** Cuándo hay que decir que un trabajo se hizo con ayuda de
   IA: material que se entrega a clientes, informes que fundan decisiones,
   comunicaciones oficiales.
5. **Qué decisiones no se automatizan.** Contratación, desvinculación,
   evaluación de desempeño, crédito, cualquier cosa que afecte los derechos de
   una persona. Siempre revisión humana que pueda explicar la decisión.
6. **Qué pasa cuando alguien incumple.** Si no está escrito, cada jefatura
   improvisa y el trato deja de ser parejo.
7. **Cuándo se revisa la política.** Con fecha. Lo que se escriba hoy estará
   desactualizado en un año, y una política vencida da falsa seguridad.

## Dos límites que otros reguladores ya trazaron

El **Reglamento Europeo de IA** no rige en Chile, pero marca dónde puso el
límite el regulador más estricto, y sirve como referencia defendible:

- **Reconocimiento de emociones prohibido en el lugar de trabajo** (y en
  instituciones educativas) desde el **2 de febrero de 2025**, salvo por razones
  médicas o de seguridad. Software que infiera del rostro o de la voz si un
  trabajador está estresado, aburrido o molesto. El fundamento declarado es la
  asimetría de poder: quien es observado no está en posición de negarse.
- **Alto riesgo con supervisión humana obligatoria** para sistemas que deciden
  acceso, admisión o evaluación de personas.

La lectura práctica para una empresa chilena: se puede hacer casi todo, pero si
una decisión afecta a una persona concreta tiene que haber alguien que pueda
explicarla. "El sistema lo determinó" no es una explicación.

## El test de si la política sirve

Entrégasela a una jefatura de área con tres casos:

1. Un analista quiere subir la base de clientes a una herramienta gratuita para
   segmentarla.
2. Recursos Humanos quiere usar IA para preseleccionar currículums.
3. Un cliente pregunta si el informe que recibió lo escribió una máquina.

Si no puede resolver los tres con el documento en la mano, a la política no le
falta extensión: le faltan decisiones.
