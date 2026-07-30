/**
 * Step-by-step tutorials, in Spanish.
 *
 * This module is the single source of truth for three things that must never
 * disagree: what the coach says out loud, what the panel draws on screen, and
 * what gets indexed into the knowledge base. The markdown the agent retrieves
 * is *generated* from this array by `npm run build:tutorials` — so a step can't
 * be renumbered here and stay stale over there. If they ever diverge the coach
 * narrates step four while the screen shows a different step four, which is
 * worse than having no visuals at all.
 *
 * Every tutorial records the source it was checked against and the date. These
 * describe other companies' user interfaces, which move without warning; a
 * tutorial with no provenance is indistinguishable from one that was invented.
 */

export interface TutorialStep {
  /** Short imperative label. Doubles as the panel heading. */
  title: string;
  /** The spoken body. Written to be read aloud: no URLs, no punctuation soup. */
  detail: string;
  /**
   * Screen-only detail — exact URLs, commands, English UI strings. Deliberately
   * excluded from speech: the persona forbids reading URLs and code aloud, and
   * a spelled-out command is useless in audio anyway.
   */
  note?: string;
  /** Basename under `public/tutoriales/`. Swap the file to use a real capture. */
  figure?: string;
}

export interface Tutorial {
  id: string;
  /** Product family, for grouping in the picker. */
  product: string;
  title: string;
  /** What the learner walks away able to do. */
  goal: string;
  /** Plan or licence requirements — the most common reason a step won't work. */
  requires: string;
  /** The thing people get wrong that the numbered steps don't convey. */
  keyPoint: string;
  steps: TutorialStep[];
  source: string;
  /** ISO date the steps were last checked against `source`. */
  checkedOn: string;
}

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: 'claude-proyectos',
    product: 'Claude Chat',
    title: 'Subir documentos a un Proyecto en Claude',
    goal: 'Subir tus documentos una sola vez y que Claude los tenga presentes en todas las conversaciones de ese proyecto.',
    requires:
      'Funciona con cuenta gratuita, con un máximo de cinco proyectos. La búsqueda ampliada sobre el conocimiento del proyecto requiere plan de pago: Pro, Max, Team o Enterprise.',
    keyPoint:
      'El contexto no se comparte entre chats de un mismo proyecto. Solo se comparte lo que esté en la base de conocimiento del proyecto. Si lo dijiste en un chat y no lo subiste, el siguiente chat no lo sabe.',
    steps: [
      {
        title: 'Abre Proyectos',
        detail:
          'En la barra lateral izquierda de Claude, pulsa Proyectos. Si la barra está oculta, acerca el cursor al borde izquierdo y aparece.',
        note: 'Atajo directo: claude.ai/projects',
        figure: 'claude-sidebar.svg',
      },
      {
        title: 'Crea el proyecto',
        detail:
          'Pulsa Nuevo proyecto, arriba a la derecha. Ponle un nombre y una descripción corta que diga para qué es. En planes Team o Enterprise además eliges si es privado o visible para toda la organización.',
        note: 'En inglés el botón dice "+ New Project".',
      },
      {
        title: 'Localiza el conocimiento del proyecto',
        detail:
          'Ya dentro del proyecto, el panel de conocimiento está a la derecha. Eso es lo que el proyecto recuerda de forma permanente.',
        figure: 'claude-project-knowledge.svg',
      },
      {
        title: 'Sube los documentos',
        detail:
          'Pulsa el botón de más en ese panel y sube tus archivos. Acepta documentos, texto y fragmentos de código. Claude los procesa y los usa como contexto en cada chat del proyecto, sin que tengas que volver a adjuntarlos.',
      },
      {
        title: 'Escribe las instrucciones del proyecto',
        detail:
          'Pulsa Definir instrucciones del proyecto, en la misma zona del panel. Ahí describes cómo quieres que Claude responda dentro de este proyecto: el tono, el formato, qué dar por supuesto. Guarda las instrucciones y aplican a todos los chats del proyecto.',
        note: 'En inglés: "Set project instructions" y luego "Save instructions".',
      },
      {
        title: 'Comprueba que quedó bien',
        detail:
          'Abre un chat nuevo dentro del proyecto y pregunta algo que solo pueda saberse leyendo lo que subiste. Si responde con detalle concreto, el conocimiento está activo. Si responde en general, revisa que el archivo terminó de subir.',
      },
    ],
    source: 'https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects',
    checkedOn: '2026-07-28',
  },

  {
    id: 'claude-skills',
    product: 'Claude Chat y Cowork',
    title: 'Activar y usar Skills en Claude',
    goal: 'Enseñarle a Claude tu forma de trabajar una vez, en un paquete reutilizable que se activa solo cuando hace falta, sin repetir las instrucciones en cada conversación.',
    requires:
      'Disponible en los planes Free, Pro, Max, Team y Enterprise. Requiere tener activada la ejecución de código y creación de archivos. En Team y Enterprise, el propietario tiene que habilitar Skills en la configuración de la organización antes de que el resto pueda usarlas.',
    keyPoint:
      'Una Skill no es lo mismo que el conocimiento de un Proyecto ni que las instrucciones personalizadas. El conocimiento del Proyecto es material de fondo, siempre presente y solo dentro de ese proyecto. Las instrucciones personalizadas aplican a todas tus conversaciones por igual. Una Skill vive en todas tus conversaciones pero se carga sola únicamente cuando la tarea la necesita: enseña un procedimiento, no aporta datos.',
    steps: [
      {
        title: 'Activa la ejecución de código',
        detail:
          'Las Skills no funcionan sin esto, así que es el primer paso y el que más se olvida. En planes Free, Pro y Max lo encuentras en la configuración, en el apartado de capacidades. En Team y Enterprise lo habilita el propietario desde la configuración de la organización.',
        note: 'Free / Pro / Max: Configuración › Capacidades › "Ejecución de código y creación de archivos".\nTeam / Enterprise: Configuración de la organización › Skills.',
      },
      {
        title: 'Abre el listado de Skills',
        detail:
          'Entra en Personalizar y luego en Skills. Ahí aparecen las que tienes disponibles, cada una con su interruptor para encenderla o apagarla.',
        note: 'Personalizar › Skills. En inglés: "Customize" › "Skills".',
        figure: 'claude-skills-panel.svg',
      },
      {
        title: 'Explora el directorio',
        detail:
          'Pulsa el botón de más para abrir el directorio y entra en la pestaña de Skills. Ahí están las de ejemplo que publica Anthropic, que sirven para ver cómo está armada una antes de escribir la tuya. En Cowork, Personalizar está en la barra lateral izquierda.',
      },
      {
        title: 'Enciende las que vas a usar',
        detail:
          'Activa solo las que necesitas. Cuando le pides algo, Claude revisa las disponibles, decide cuáles hacen falta y carga únicamente esas. Tener muchas encendidas que no usas no le ayuda a elegir.',
      },
      {
        title: 'Úsala describiendo la tarea',
        detail:
          'No hace falta invocar nada. Describe lo que quieres con normalidad y Claude reconoce por su cuenta si alguna Skill aplica. En los complementos de Microsoft 365 sí puedes llamarlas escribiendo una barra para ver la lista.',
      },
      {
        title: 'Sube la tuya',
        detail:
          'Cuando quieras empaquetar tu propia forma de trabajar, comprime la carpeta de la Skill en un archivo zip. En el listado de Skills pulsa el botón de más, elige crear una Skill, y luego la opción de subirla. Las que subes tú son privadas de tu cuenta.',
        note: 'Personalizar › Skills › "+" › "+ Crear skill" › "Subir una skill". El paquete se sube como .zip.',
      },
      {
        title: 'Compártela con tu equipo, si aplica',
        detail:
          'En Team y Enterprise las Skills se ordenan en tres grupos: las personales que creaste tú, las que te compartió un colega, que aparecen apagadas hasta que las enciendas, y las de la organización. Si el propietario sube una desde la configuración de la organización, le aparece a todo el mundo y nadie más tiene que subirla por su cuenta.',
      },
    ],
    source: 'https://support.claude.com/en/articles/12512180-use-skills-in-claude',
    checkedOn: '2026-07-29',
  },

  {
    id: 'claude-cowork',
    product: 'Claude Cowork',
    title: 'Poner a Claude a trabajar sobre tus archivos con Cowork',
    goal: 'Que Claude lea, edite y produzca archivos reales en tus carpetas, en lugar de explicarte cómo hacerlo tú.',
    requires: 'Plan de pago: Pro, Max, Team o Enterprise.',
    keyPoint:
      'La diferencia con Chat es cuál es el entregable. En Chat el resultado es una respuesta que luego tú aplicas. En Cowork el resultado es el archivo ya hecho. Por eso se le describe el resultado buscado, no la explicación que quieres oír.',
    steps: [
      {
        title: 'Instala la aplicación de escritorio',
        detail:
          'Cowork también funciona en web y en móvil, pero para que llegue a los archivos de tu computadora necesitas la aplicación de escritorio, en Mac o en Windows.',
        note: 'Descarga: claude.com/download',
      },
      {
        title: 'Cambia de Chat a Cowork',
        detail:
          'Abre Claude y, en el cuadro de mensaje, selecciona Cowork en lugar de Chat. Es el mismo cuadro de siempre. Lo único que cambia es el modo.',
        figure: 'cowork-mode-switch.svg',
      },
      {
        title: 'Dale la carpeta',
        detail:
          'Selecciona la carpeta local sobre la que va a trabajar. Todo lo que haga queda acotado a lo que le entregues, así que empieza por una carpeta concreta y no por tu disco entero.',
      },
      {
        title: 'Describe el resultado, no los pasos',
        detail:
          'Di qué quieres tener al final. Claude analiza la petición, arma un plan, y si la tarea es grande la parte en subtareas. Revisa ese plan antes de dejarlo avanzar: corregirlo ahí cuesta mucho menos que corregir el entregable después.',
      },
      {
        title: 'Elige cuánto quieres aprobar',
        detail:
          'Hay tres modos. Manual pausa y te pide permiso en cada acción. Automático avanza solo con revisiones de seguridad, y solo se detiene en lo sensible. Y el modo que omite las pausas no pregunta ni revisa nada. Empieza en Manual hasta que veas cómo trabaja.',
        note: 'El modo automático consume más uso, por la revisión de seguridad añadida.',
        figure: 'cowork-permisos.svg',
      },
      {
        title: 'Sigue la tarea y corrige sobre la marcha',
        detail:
          'Verás el avance y el razonamiento mientras trabaja, y puedes reconducirlo sin empezar de cero. Puedes lanzar la tarea en el escritorio y revisarla desde el teléfono. Deja la aplicación de escritorio abierta mientras dure, o pierde el acceso a tus archivos locales.',
      },
    ],
    source: 'https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork',
    checkedOn: '2026-07-28',
  },

  {
    id: 'claude-code',
    product: 'Claude Code',
    title: 'Instalar Claude Code y hacer tu primer cambio',
    goal: 'Tener a Claude trabajando dentro de tu proyecto desde la terminal: que lo lea, responda sobre él y edite archivos.',
    requires:
      'Una suscripción de Claude (Pro, Max, Team o Enterprise), una cuenta de Claude Console con crédito, o acceso por un proveedor de nube compatible.',
    keyPoint:
      'No tienes que adjuntarle archivos. Claude Code lee lo que necesita de tu proyecto por su cuenta, así que las preguntas se hacen en lenguaje natural y sin preparar contexto.',
    steps: [
      {
        title: 'Instálalo',
        detail:
          'Abre una terminal y ejecuta el instalador. En Mac, Linux o subsistema de Windows es una sola línea. En Windows hay una equivalente para PowerShell.',
        note: 'macOS / Linux / WSL:\ncurl -fsSL https://claude.ai/install.sh | bash\n\nWindows PowerShell:\nirm https://claude.ai/install.ps1 | iex\n\nCon Homebrew:\nbrew install --cask claude-code',
        figure: 'claude-code-terminal.svg',
      },
      {
        title: 'Comprueba que quedó instalado',
        detail:
          'Pide la versión. Si responde con un número de versión, la instalación está lista.',
        note: 'claude --version',
      },
      {
        title: 'Inicia sesión',
        detail:
          'Ejecuta el comando claude. La primera vez te pide iniciar sesión y completas la autenticación en el navegador. Las credenciales quedan guardadas, así que esto se hace una sola vez. Para cambiar de cuenta más adelante, usa el comando de inicio de sesión dentro de la sesión.',
        note: 'Iniciar: claude\nCambiar de cuenta, ya dentro: /login',
      },
      {
        title: 'Ábrelo en tu proyecto',
        detail:
          'Sitúate en la carpeta del proyecto y vuelve a ejecutar claude. Arriba verás la versión, el modelo y el directorio en el que está trabajando. Confirma que ese directorio es el correcto antes de pedirle nada.',
        note: 'cd /ruta/a/tu/proyecto\nclaude',
      },
      {
        title: 'Haz la primera pregunta',
        detail:
          'Pregúntale qué hace este proyecto. Va a leer los archivos y darte un resumen. Sirve para dos cosas a la vez: tú entiendes el proyecto y compruebas que él lo está leyendo de verdad.',
      },
      {
        title: 'Pide el primer cambio',
        detail:
          'Pídele algo pequeño y concreto. Localiza el archivo, te muestra el cambio propuesto, y según el modo de permisos te pide aprobación antes de tocar nada. Sé específico: en vez de arregla el error, di cuál es el error y qué debería pasar en su lugar.',
      },
      {
        title: 'Ajusta cuánto te pregunta',
        detail:
          'Con Shift y Tabulador cambias de modo de permisos. Por defecto pide aprobación en cada cambio. Un modo aprueba las ediciones automáticamente, y otro planifica sin tocar archivos. Empieza por el de por defecto.',
        note: 'Shift+Tab alterna entre modos. /help lista los comandos disponibles.',
      },
    ],
    source: 'https://code.claude.com/docs/en/quickstart',
    checkedOn: '2026-07-28',
  },

  {
    id: 'chatgpt-proyectos',
    product: 'ChatGPT',
    title: 'Crear un Proyecto en ChatGPT y darle archivos',
    goal: 'Agrupar los chats de un mismo tema con sus archivos de referencia y sus instrucciones, para no repetir el contexto cada vez.',
    requires:
      'Disponible en ChatGPT. La cantidad de archivos que puedes subir depende de tu plan.',
    keyPoint:
      'A diferencia de un Proyecto en Claude, aquí el proyecto tiene memoria de los chats anteriores, no solo de los archivos subidos. Recuerda dónde lo dejaste sin que tengas que documentarlo.',
    steps: [
      {
        title: 'Crea el proyecto',
        detail:
          'Desde la barra lateral, crea un proyecto nuevo y ponle un nombre que describa el trabajo, no el tema. Un proyecto es un espacio de trabajo, no una carpeta de archivos.',
        figure: 'chatgpt-proyecto.svg',
      },
      {
        title: 'Sube el material de referencia',
        detail:
          'Añade tus archivos al proyecto: documentos, hojas de cálculo, presentaciones, imágenes, o texto pegado directamente.',
      },
      {
        title: 'Resuelve los nombres repetidos',
        detail:
          'Si subes un archivo que se llama igual que uno que ya está, te pregunta si lo subes igual o lo omites. Si estabas subiendo varios, omitir uno no cancela el resto.',
      },
      {
        title: 'Escribe las instrucciones del proyecto',
        detail:
          'Abre el menú de tres puntos, arriba a la derecha del proyecto, y entra en la configuración del proyecto. Ahí escribes las instrucciones que aplican a todos sus chats.',
        note: 'En inglés: los tres puntos y luego "Project settings".',
      },
      {
        title: 'Mueve los chats que ya tenías',
        detail:
          'Si ya venías conversando sobre esto fuera del proyecto, puedes mover esos chats adentro en vez de empezarlos otra vez.',
      },
    ],
    source: 'https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt',
    checkedOn: '2026-07-28',
  },
];

export function tutorialById(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}

/** The id list handed to the agent so it can only ever name a real tutorial. */
export const TUTORIAL_IDS: readonly string[] = TUTORIALS.map((t) => t.id);
