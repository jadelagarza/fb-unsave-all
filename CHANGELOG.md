# Cambios

## 1.0.1 — 15 de noviembre de 2026

- Muestra Comprobando inmediatamente al pulsar Comprobar esta página y coloca el resultado o error concreto junto al botón. Antes, los errores quedaban al final del panel y podían quedar fuera de vista.
- Evita clics duplicados y consultas periódicas de estado mientras se comprueba la página.
- Limita la espera de inspección de Facebook a 8 segundos y evita que una página sin respuesta bloquee todos los mensajes posteriores del panel. Una respuesta tardía no puede iniciar una eliminación tras un fallo de comprobación.
- Detecta respuestas incompatibles de scripts anteriores y muestra cómo recargar la extensión y Facebook.
- Muestra la versión instalada en la cabecera y añade pruebas del botón, errores visibles, tiempos de espera y recuperación.

## 1.0.0 — 15 de noviembre de 2026

- Añade el modo predeterminado **Guardados: uno por uno** en `/saved/`, con los tres puntos y la opción Eliminar del menú de cada tarjeta.
- Añade desplazamiento automático para acceder a los controles y cargar nuevas tarjetas conforme se necesiten, sin recargas entre elementos.
- Configura la espera entre elementos en segundos (4 por defecto) y un máximo opcional (0 para continuar mientras aparezcan tarjetas).
- Verifica la desaparición estable de cada tarjeta antes de contarla; detiene la ejecución ante resultados inciertos, menús ambiguos o alertas de Facebook.
- Conserva el modo por lotes del Registro de actividad y sus comprobaciones de recarga y progreso.
- Actualiza el panel, las guías en español e inglés, la documentación de desarrollo y las pruebas de ciclo y Chromium para ambos modos.
- Publica la primera versión mayor; el modo inicial del panel cambia de Registro de actividad a Guardados. Al actualizar, recarga la extensión y Facebook y selecciona explícitamente el modo que quieras usar.

## 0.1.4 — 14 de noviembre de 2026

- Corrige una identificación equivocada: la barra global de 4px en la parte superior no es el círculo central de eliminación.
- Reconoce capas visuales que interceptan Todo y contienen un anillo SVG o una animación de carga, incluso si son decorativos y no tienen etiquetas accesibles.
- Permite una recarga de verificación al restablecerse la selección y la interacción, aunque Facebook conserve las filas antiguas hasta recargar.
- Mantiene el lote pendiente hasta verificar progreso en el documento nuevo. No aumenta contadores ni inicia otro lote si reaparece la misma lista.
- Añade pruebas de cinco lotes con filas desactualizadas, anillo decorativo, barra superior visible y selección restablecida antes de desaparecer la capa.

## 0.1.3 — 14 de noviembre de 2026

- Reconoce «No hay nada para mostrar», incluso con la casilla Todo visible y deshabilitada.
- Verifica el fin de cada eliminación antes de recargar. Si no se observó el indicador, exige evidencia estable de que desaparecieron todos los elementos seleccionados capturados o de que la vista está explícitamente vacía, con la selección restablecida.
- Una vista vacía después de eliminar sólo termina el lote actual: se recarga siempre para comprobar si quedan otros lotes. La limpieza sólo finaliza por vacío después de esa comprobación.
- Añade pruebas de dos y tres lotes, último lote parcial, indicador no observable, vacío transitorio, selección que tarda en restablecerse y eliminación que reaparece después de recargar.

## 0.1.2 — 14 de noviembre de 2026

- Corrige la detección de la capa global de carga que Facebook coloca fuera del área principal y de los diálogos. Se confirmó su estructura mediante inspección del DOM real, sin ejecutar eliminaciones para inspeccionarla.
- Detecta cuándo el indicador se oculta por CSS, opacidad o un antecesor, además de cuándo se elimina del DOM. Conserva la espera estable antes de recargar; no añade recargas por tiempo fijo.
- Distingue en el panel la espera de aparición del indicador de la espera de su desaparición.
- Añade pruebas de capas globales y de la prohibición de recargar mientras la capa siga visible.

## 0.1.1 — 14 de noviembre de 2026

- Corrige la lectura del contador cuando Facebook sólo muestra un número (por ejemplo, `16`) en lugar de «16 elementos seleccionados». La versión 0.1.0 se detenía antes de abrir la confirmación de eliminación.
- Limita la lectura del contador a la barra que reúne Todo, Desmarcar y Eliminar; ignora números, fechas y frases de las publicaciones guardadas.
- Añade pruebas con el formato numérico observado, números ajenos al contador y contadores ambiguos. Conserva la espera del indicador de carga antes de recargar.

## 0.1.0 — 14 de noviembre de 2026

- Primera implementación de la extensión local para limpiar guardados por lotes con recarga posterior al ciclo de carga.
