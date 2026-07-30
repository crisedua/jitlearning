# IA para enseñar y evaluar

Este es el frente difícil. No porque la tecnología sea complicada, sino porque
la evidencia disponible apunta en dos direcciones opuestas y **la diferencia
está en el diseño**, no en la herramienta.

## Los dos estudios que hay que conocer

### Kestin y Miller, Harvard, 2024: el tutor que funcionó

Gregory Kestin y Kelly Miller estudiaron a **194 estudiantes** del curso
Physical Sciences 2 (física para carreras de ciencias de la vida) en Harvard.
Compararon aprender con un tutor de IA fuera de clase contra la clase presencial
habitual, que ya usaba metodologías de aprendizaje activo —es decir, el punto de
comparación no era una clase expositiva mala.

Resultado: los estudiantes que usaron el tutor **aprendieron más del doble y en
menos tiempo**, y reportaron sentirse más comprometidos y motivados.

Lo importante no es el titular, sino cómo estaba construido ese tutor. Kestin
atribuye el resultado a haberlo ajustado con criterios pedagógicos explícitos:

- **Responder brevemente**, no más de unas pocas frases, para no saturar.
- **Dar un solo paso por vez.**
- **No entregar la solución completa** en un mensaje.

Es decir: un tutor diseñado para que el estudiante haga el trabajo cognitivo,
no para resolverle el problema. El propio Kestin aclara que su resultado no es
un argumento para reemplazar la interacción humana.

### Bastani y otros, PNAS, 2025: el mismo modelo, haciendo daño

*Generative AI without guardrails can harm learning: Evidence from high school
mathematics* (Hamsa Bastani, Osbert Bastani, Alp Sungu y otros) es un
experimento aleatorizado con cerca de **1.000 estudiantes** de matemáticas de
9°, 10° y 11° grado en un liceo de Turquía. Tres grupos:

- **GPT Base**: acceso a una interfaz tipo ChatGPT sin restricciones.
- **GPT Tutor**: la misma tecnología, con salvaguardas, diseñada con aporte
  docente para guiar con pistas en vez de dar respuestas.
- **Control**: sin tecnología, solo texto y apuntes.

Durante la práctica *con acceso*, ambos grupos mejoraron mucho: **+48%** el
grupo base y **+127%** el grupo con tutor.

Después les quitaron el acceso y rindieron una prueba solos. Ahí aparece el
hallazgo: el grupo que había usado GPT sin salvaguardas rindió **17% peor que el
grupo de control**, que nunca tuvo acceso. El grupo con salvaguardas quedó
aproximadamente igual que el control: el daño se neutralizó, pero la ventaja
espectacular de la práctica no se tradujo en aprendizaje.

La explicación de los autores: sin restricciones, los estudiantes usan el modelo
como **muleta**. Practican con la respuesta al lado, sienten que están
aprendiendo, y no están haciendo el esfuerzo que produce el aprendizaje.

## Qué se saca de leer los dos juntos

No se contradicen tanto como parece, y de ahí sale la regla más útil que existe
hoy sobre IA en el aula:

> Un modelo que responde preguntas hace daño. Un modelo diseñado para que el
> estudiante trabaje puede ayudar. Es el mismo modelo: cambia la instrucción y
> cambia el resultado.

Y una segunda lectura, menos cómoda: **la sensación de estar aprendiendo mejora
casi siempre; el aprendizaje, no**. Los estudiantes de Bastani se sentían mucho
mejor durante la práctica y después rindieron peor. Cualquier evaluación de un
piloto que se base en encuestas de satisfacción va a dar positiva, incluso
cuando el resultado sea negativo. Hay que medir aprendizaje sin la herramienta
al lado.

Diferencias que conviene no olvidar antes de generalizar: uno es universitario y
el otro escolar; uno es física y el otro matemáticas; uno usó un tutor a medida
y el otro comparó dos configuraciones. Son dos estudios, no una ley.

## Cómo se ve un uso bien diseñado

De los dos estudios, y de la guía de UNESCO (2023), sale un mismo perfil:

- **Pistas, no respuestas.** Que devuelva la siguiente pregunta, no el
  resultado.
- **Un paso a la vez.** Cuando entrega el procedimiento completo, el estudiante
  lo copia.
- **Con la voz del docente adentro.** En el estudio turco, la diferencia entre
  ayudar y perjudicar fue el aporte pedagógico incorporado en las instrucciones.
- **Con el estudiante mostrando su intento primero.** Que escriba lo que probó
  antes de pedir ayuda.
- **Con salida sin herramienta.** Práctica asistida, evaluación desasistida.

## Qué hacer con las evaluaciones

Si la tarea se puede resolver con un modelo en dos minutos, la tarea ya no mide
lo que decía medir. Eso pasó, y no se revierte prohibiendo.

Opciones que se pueden aplicar sin cambiar el reglamento entero:

- **Mover la evaluación al proceso.** Borradores, versiones, defensa oral breve.
  El producto final dejó de ser evidencia suficiente.
- **Pedir la aplicación a un caso propio.** Un modelo responde bien lo genérico;
  no conoce el contexto del estudiante ni lo que pasó en esa clase.
- **Evaluar en condiciones controladas lo que de verdad importa que sepan
  solos.** No todo, pero sí lo esencial. Bastani sugiere por qué: lo que se
  practicó siempre asistido, no queda.
- **Incorporar el uso de IA como objeto de evaluación.** Pedir que entreguen la
  conversación con el modelo y la crítica de sus respuestas evalúa criterio, que
  es lo que sí queremos que desarrollen.

## Lo que la IA no reemplaza

UNESCO fue explícita en 2023: la IA generativa **no es una solución mágica a los
desafíos fundamentales de la educación**. Un curso con 40 estudiantes, sin
material, con inasistencia alta y con docentes agotados no se arregla con un
chatbot. El riesgo real de estos proyectos no es que fracasen: es que consuman
la atención directiva que necesitaba algo más básico.
