# Datos personales y la Ley 21.719 (Chile)

Este es el documento con fecha de vencimiento más cercana de toda la base, y el
que un modelo general responde peor: es normativa chilena reciente, específica,
y con un plazo que ya está encima.

## Lo esencial

La **Ley 21.719**, que regula la protección y el tratamiento de datos
personales y crea la Agencia de Protección de Datos Personales, fue **publicada
en el Diario Oficial el 13 de diciembre de 2024** y **entra en vigencia el 1 de
diciembre de 2026**.

Aplica a **cualquier persona natural o jurídica que trate datos personales**, y
a los órganos públicos en el ejercicio de sus funciones. No hay excepción por
tamaño: una empresa de quince personas que guarda datos de clientes está dentro.

Si estás leyendo esto durante 2026, el plazo se cuenta en meses, no en años.

## Qué obliga a tener

Según la ley y los análisis publicados sobre ella, las obligaciones centrales
para una organización son:

- **Registro de actividades de tratamiento.** Documentar qué datos se tratan,
  para qué, con qué base legal y a quién se comunican. Es el equivalente al
  inventario que el marco NIST llama *Map*, y es el punto donde una empresa
  descubre cuántas herramientas de IA está usando sin saberlo.
- **Delegado de Protección de Datos (DPO).** Exigible a organizaciones públicas
  y privadas que traten datos personales de manera significativa.
- **Notificación de brechas.** Aviso dentro de **72 horas** cuando ocurre una
  vulneración que afecta datos personales.
- **Derechos ARCO completos** para las personas: acceso, rectificación,
  cancelación y oposición, más portabilidad.
- **Base de licitud para cada tratamiento.** El consentimiento deja de ser un
  trámite: tiene que ser libre, informado y específico.

**Sanciones.** Multas que las fuentes consultadas sitúan en hasta **20.000 UTM**
para las infracciones más graves, con posibilidad de triplicarse en caso de
reincidencia, y referencias a topes porcentuales sobre los ingresos anuales para
empresas grandes. Antes de citar una cifra exacta en una presentación al
directorio, verifica el tramo en el texto oficial de la ley: los rangos y sus
condiciones son el detalle que más se distorsiona al repetirse.

## Qué significa esto cuando usas IA

La ley no habla de inteligencia artificial. Le da igual: si metes datos
personales en una herramienta, eso es tratamiento de datos personales, y se
aplica igual que si los metieras en una planilla.

Las consecuencias prácticas, en orden de urgencia:

**1. Saber qué herramientas están en uso.** No se puede registrar el tratamiento
que se desconoce. Antes de cualquier otra cosa: inventario de qué herramientas
de IA usa cada área, con qué datos y bajo qué cuenta —personal o corporativa—.

**2. Decidir qué datos no salen.** Nombres de clientes junto a información de su
comportamiento, datos de trabajadores, antecedentes de salud, remuneraciones,
evaluaciones de desempeño, cualquier cosa sujeta a confidencialidad contractual.

**3. El error de la falsa anonimización.** Quitar el nombre no anonimiza. "El
cliente de la sucursal de Chillán que reclamó dos veces en marzo" identifica a
una persona. La prueba práctica: si alguien de la organización pudiera adivinar
de quién se habla, no está anonimizado, y sigue siendo tratamiento de datos
personales.

**4. Preguntas que hay que hacerle al proveedor**, antes de firmar y por
escrito: dónde se almacenan los datos, si se usan para entrenar modelos, cuánto
tiempo se conservan, qué pasa al terminar el contrato, si hay cuentas
corporativas separadas de las personales, y si notifican brechas en un plazo
compatible con las 72 horas que ahora te obligan a ti.

Una herramienta gratuita que no responde con claridad a la segunda pregunta se
está pagando con los datos de tus clientes.

**5. Cuentas personales para trabajo es el agujero más común.** Un trabajador
que usa su cuenta personal para procesar datos de la empresa saca esos datos del
perímetro y de cualquier contrato. Se resuelve con cuentas corporativas y con
una regla escrita, no con una charla.

## El marco nacional, para contexto

Chile actualizó su **Política Nacional de Inteligencia Artificial** mediante el
**Decreto N° 12 del Ministerio de Ciencia, Tecnología, Conocimiento e
Innovación, publicado el 28 de enero de 2025**, que renueva la política original
de 2021 y mantiene su horizonte a **2031**. Sus ejes declarados: uso ético y
responsable, bienestar social y respeto a los derechos fundamentales.

Es política pública, no obligación exigible. Sirve para dos cosas concretas:
alinear el lenguaje de una propuesta interna con el del Estado, y anticipar por
dónde va a venir la regulación.

## Lo mínimo que hacer este mes

- [ ] Inventario de herramientas de IA en uso, por área, con qué datos.
- [ ] Lista escrita de qué información no puede salir de la organización.
- [ ] Cuentas corporativas donde hoy se usan cuentas personales.
- [ ] Un responsable con nombre para la preparación de la Ley 21.719.
- [ ] Revisar los contratos con proveedores que ya tratan datos por ti.

Ninguna de las cinco requiere presupuesto. Las cinco toman semanas, no días, y
el 1 de diciembre de 2026 no se mueve.
