# Qué son las Skills de Claude

Las Skills existen y son una función real de Claude. Se registra aquí de forma explícita porque es el tipo de función que un modelo entrenado antes de su lanzamiento no reconoce, y negarla suena igual de seguro que confirmarla.

Contrastado con la documentación oficial el 2026-07-29. Fuentes al final.

## En una frase

Una Skill es un paquete de instrucciones que le enseña a Claude tu forma concreta de hacer algo, y que Claude carga por su cuenta solo cuando la tarea lo pide.

## Qué contiene

Una Skill es una carpeta con instrucciones, y opcionalmente scripts y otros recursos. Lo mínimo es un documento en Markdown que describe el procedimiento. Los scripts son para casos avanzados; no hacen falta para empezar.

En Claude Code la carpeta lleva un archivo llamado `SKILL.md`, con un encabezado en YAML que describe cuándo usar la Skill y, debajo, las instrucciones en Markdown. El campo que importa es `description`: es lo que Claude lee para decidir si esta Skill aplica a lo que le acabas de pedir.

## Cómo decide Claude usarla

Por revelación progresiva. Cuando le mandas una tarea, Claude repasa la lista de Skills disponibles, mira cuáles son relevantes, y carga en contexto solo esas. Las demás no le ocupan espacio.

Esto tiene una consecuencia práctica: la calidad de la descripción decide si la Skill se activa. Una Skill excelente con una descripción vaga no se usa nunca, y desde fuera parece que no funciona.

## En qué se diferencia de lo que se le parece

Esta es la parte que más se confunde, y la confusión lleva a explicar una cosa creyendo que es otra.

**No es el conocimiento de un Proyecto.** El conocimiento del Proyecto es material de fondo: está siempre presente, es información y no procedimiento, y vive solo dentro de ese proyecto. Una Skill está disponible en todas tus conversaciones, pero solo se carga cuando aplica. Dicho corto: el Proyecto aporta datos, la Skill aporta el cómo.

**No es un conector.** Un conector, o servidor MCP, es lo que enlaza a Claude con un servicio externo y sus datos. La Skill enseña a usar bien esa herramienta. Son complementarios: el conector da el acceso, la Skill da el método.

**No son las instrucciones personalizadas.** Las instrucciones personalizadas aplican de forma amplia a todas tus conversaciones. Una Skill apunta a un flujo de trabajo específico y solo entra cuando ese flujo aparece.

**No son las herramientas integradas.** La búsqueda web, el análisis de datos y la generación de archivos son herramientas, no Skills. Confundirlas es el error más común: llevan a decir que "activas la skill de búsqueda web", que no existe como tal.

## Requisitos

Disponibles en los planes Free, Pro, Max, Team y Enterprise.

Requieren tener activada la ejecución de código y creación de archivos. Sin eso no funciona ninguna, y es la causa más frecuente de que alguien crea que las Skills no le sirven.

En Team y Enterprise, el propietario tiene que habilitar Skills en la configuración de la organización antes de que el resto pueda usarlas.

## Dónde funcionan

En Claude Chat y en Cowork, desde el menú Personalizar. En los complementos de Microsoft 365, donde además puedes llamarlas escribiendo una barra. Y en Claude Code, donde se invocan con barra y el nombre de la Skill, o Claude las carga sola cuando la descripción coincide con lo que pediste.

Claude Code sigue el estándar abierto Agent Skills, así que el mismo formato de carpeta sirve en varias herramientas y no solo en las de Anthropic.

## Ejemplos reales de para qué sirven

- Aplicar la identidad de marca a presentaciones y documentos.
- Redactar correos siguiendo las plantillas de la empresa.
- Crear tareas en un gestor como JIRA o Asana con el formato que usa el equipo.
- Ejecutar un análisis de datos con el método propio de la organización.

El patrón detrás de todos: hay algo que explicas igual cada vez. Eso es una Skill.

## Cuándo conviene crear una

Cuando llevas varias veces pegando las mismas instrucciones, la misma lista de comprobación o el mismo procedimiento de varios pasos. También cuando una sección de tus instrucciones permanentes ha dejado de ser un dato y se ha convertido en un procedimiento.

La ventaja frente a dejarlo en las instrucciones fijas es el costo: el cuerpo de una Skill se carga solo cuando se usa, así que un material de referencia largo no te cuesta nada mientras no lo necesites.

## Tipos, en equipos

En Team y Enterprise las Skills se agrupan en tres:

- **Personales**: las que creaste o subiste tú. Son privadas de tu cuenta.
- **Compartidas**: las que te pasó un colega. Aparecen apagadas hasta que las enciendas.
- **De la organización**: las que instaló o subió el propietario. Le aparecen a todo el mundo, y nadie más tiene que subirlas por separado.

## Fuentes

- Qué son las Skills: https://support.claude.com/en/articles/12512176-what-are-skills
- Usar Skills en Claude: https://support.claude.com/en/articles/12512180-use-skills-in-claude
- Crear Skills personalizadas: https://support.claude.com/en/articles/12512198-how-to-create-custom-skills
- Skills en Claude Code: https://code.claude.com/docs/en/skills

Las interfaces cambian sin aviso. Si el nombre de una opción no coincide con lo que ve la persona, guíate por la ubicación y la función, y dilo abiertamente en vez de insistir en el nombre exacto.
