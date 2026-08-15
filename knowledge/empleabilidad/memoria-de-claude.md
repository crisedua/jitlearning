# La memoria de Claude entre conversaciones

Claude sí tiene memoria entre conversaciones distintas. Se registra aquí de forma explícita porque es lo contrario de lo que un modelo entrenado hace tiempo recuerda: durante mucho tiempo cada conversación empezaba de cero, y ese recuerdo antiguo se siente exactamente igual de firme que un dato actual.

Si alguien pregunta por esto, la respuesta es que sí existe, no que no.

Contrastado con la documentación oficial el 2026-07-30. Fuentes al final.

## Qué hace

Son dos capacidades relacionadas y conviene no mezclarlas.

**Buscar en conversaciones anteriores.** Puedes pedirle que rebusque en tus chats pasados para encontrar y reutilizar algo que ya hablasteis. Es a petición: tú se lo pides.

**Memoria propiamente dicha.** Claude retiene contexto de conversaciones anteriores y lo trae solo, de forma que hay continuidad entre sesiones sin que tengas que recordarle nada.

## Dónde se activa

En la configuración, en el apartado de Memoria. Si ves Memoria como sección propia en la configuración, tienes la versión nueva de la función. Al activarla por primera vez puedes dejar que Claude construya la memoria a partir de tus conversaciones pasadas.

Se apaga desde el mismo sitio, con el interruptor de buscar y referenciar chats. Se puede volver a encender cuando quieras.

## Qué plan hace falta

La búsqueda en conversaciones anteriores está en los planes de pago: Pro, Max, Team y Enterprise. Funciona en la web, en la aplicación de escritorio y en las aplicaciones móviles.

## Memoria separada por proyecto

Si usas Proyectos, Claude mantiene una memoria distinta para cada uno. Lo que hablas sobre el lanzamiento de un producto no se mezcla con el trabajo de un cliente, y una conversación confidencial no se filtra a la operación general.

Esto importa para decidir cómo organizarte: separar en proyectos no es solo ordenar archivos, también aísla lo que recuerda.

## La consecuencia práctica

Cambia el consejo habitual de "resume la conversación y pégala al principio de la siguiente". Ese apaño era necesario cuando no había memoria. Con la memoria activada deja de serlo para la continuidad normal, aunque sigue siendo útil cuando quieres controlar con precisión qué contexto entra y cuál no.

También se puede importar y exportar la memoria, lo que permite llevártela en lugar de reconstruirla desde cero.

## Fuentes

- Búsqueda de chats y memoria: https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context
- Importar y exportar la memoria: https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude

Las interfaces cambian sin aviso. Si el nombre de una opción no coincide con lo que ve la persona, guíate por la ubicación y la función, y dilo abiertamente en vez de insistir en el nombre exacto.
