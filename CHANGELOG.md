# Cambios

## 1.2.0 — 17 de noviembre de 2026

- Añade tres tonos breves al bloquearse una ejecución por un error, en Guardados, colecciones y Registro de actividad, incluso con el panel cerrado.
- Avisa también ante errores de acciones del panel. Evita repetir el sonido al consultar el estado, reabrir el panel o informar otra vez el mismo fallo, y evita el doble aviso al fallar Start.
- Añade Probar sonido de error, independiente de la limpieza, y un aviso visible si el reproductor no pudo iniciar. Conserva el mensaje original y la detención aunque falle el audio.
- Añade un reproductor offscreen y su permiso, con sonido WAV generado localmente y sin archivos o servicios externos. Reutiliza o recrea el contexto, autentica sus mensajes y serializa tonos distintos.
- Mantiene silenciosos el final normal, Detener y el cierre de la pestaña; el audio no bloquea la cola de control de la limpieza.
- Añade pruebas de lógica, permisos, reproducción, recuperación y Chromium con el panel cerrado. Actualiza las guías y la documentación técnica.

## 1.1.1 — 16 de noviembre de 2026

- Corrige la verificación de tarjetas vacías o no disponibles cuando Facebook incorpora nuevos elementos durante la retirada: permite una reducción dentro de un grupo delimitado por vecinas conservadas o referencias identificables, sin exigir que toda la lista permanezca igual.
- Exige que el control objetivo ya no corresponda a una tarjeta actual y que no aparezca información identificable dentro del intervalo. Una reconstrucción o la retirada de otra tarjeta no bastan para contar el objetivo.
- Conserva la comprobación global estricta cuando no sirve un grupo. La estabilidad se calcula sobre la evidencia del objetivo, sin reiniciarse por altas ajenas.
- Registra las cantidades iniciales de grupo antes del clic y valida el tipo, índice, reducción y evidencia en el protocolo de progreso.
- Añade motivos concretos a los tiempos agotados: tarjeta presente, referencias perdidas, cambio de identidad, cantidad sin reducción, carga pendiente, menú o diálogo abierto, lista no reconocida y resultado inestable.
- Añade pruebas de reposición, reconstrucción, ausencia de progreso, cambios de identidad y protocolo. Actualiza las guías y la documentación de desarrollo. Mantiene las acciones exclusivas de colección, límites, pausas, scroll y Detener.

## 1.1.0 — 16 de noviembre de 2026

- Añade limpieza uno por uno dentro de una colección abierta en `/saved/?list_id=…`, con el mismo límite, pausa configurable, cuenta regresiva, scroll automático y Detener.
- Usa exclusivamente Eliminar de la colección en el menú de cada tarjeta; nunca elimina la colección ni selecciona Eliminar genérico en esa vista.
- Reconoce la variante sin Agregar a colección ni Compartir y los avisos repetidos de contenido no disponible sin título o enlace propio. Verifica su desaparición mediante una reducción de uno y elementos identificables intactos.
- Vincula cada ejecución a la vista inicial, además de pestaña y documento. Cambiar de colección o ir a todos los guardados la detiene; no depende de parámetros de seguimiento.
- Actualiza el panel, aceptación, guías en español e inglés y documentación de desarrollo. Añade pruebas del menú, límites, pausa, scroll, contenido no disponible, detención y cambios de vista.

## 1.0.7 — 15 de noviembre de 2026

- Añade tratamiento para la tarjeta vacía observada en el DOM real: sólo metadatos Reel, un enlace genérico sin texto y los controles Agregar a colección y Más. También admite esa estructura sin enlace.
- Procesa una o varias tarjetas sin identificar mediante sus propios menús. Antes de pulsar Eliminar comprueba que el control siga perteneciendo a la tarjeta y que la lista no haya cambiado.
- Verifica una reducción de exactamente una tarjeta vacía y el mismo conjunto de elementos identificables durante 1.5 segundos. Un cambio de título, una carga parcial o cambios en los demás elementos no bastan para contar la eliminación.
- Añade un token por operación y comprobaciones de cantidad al protocolo de progreso, manteniendo las comprobaciones de propiedad, pausa y detención.
- Añade pruebas de tarjetas vacías consecutivas, última tarjeta sin enlace, llegada por scroll, conversión a tarjeta identificable y cancelación. Actualiza las guías en español e inglés.

## 1.0.6 — 15 de noviembre de 2026

- Corrige una coincidencia confirmada en el DOM real: dos productos con títulos distintos enlazaban a `https://facebook.com/` y recibían la misma identidad basada sólo en enlaces.
- Descarta como identidad los enlaces genéricos de inicio y colecciones. Cuando no queda un enlace específico, utiliza un hash del título accesible de la acción o del texto del enlace genérico del producto.
- No incorpora el precio ni la posición de la tarjeta a ese respaldo. Conserva la detención si tampoco el título distingue los elementos.
- Añade pruebas de reconstrucción del DOM, títulos indistinguibles y cambios de precio sin eliminación. Actualiza las guías en español e inglés.

## 1.0.5 — 15 de noviembre de 2026

- Reconoce la etiqueta observada «Más opciones para el elemento guardado», también cuando la tarjeta sólo muestra Agregar a colección y los tres puntos.
- Admite listas que mezclan tarjetas de dos y tres controles sin exigir Compartir para identificar una acción Más reconocida.
- Conserva la detención ante acciones desconocidas: no interpreta cualquier segundo botón o `aria-haspopup="dialog"` como menú de eliminación.
- Añade pruebas de Chromium para una lista mixta y para rechazar una tarjeta de dos controles con una acción desconocida. Actualiza las guías en español e inglés.

## 1.0.4 — 15 de noviembre de 2026

- Muestra una cuenta regresiva del tiempo real restante durante las pausas entre elementos y entre lotes.
- Calcula los segundos desde `notBefore`, sin reiniciar la espera al reabrir el panel ni modificar la pausa configurada.
- Actualiza el texto localmente, sin añadir consultas a Facebook ni mensajes adicionales al service worker. Al detener o finalizar, muestra el estado correspondiente.

## 1.0.3 — 15 de noviembre de 2026

- Corrige una incompatibilidad confirmada mediante inspección del DOM real: los nombres accesibles incluyen el título de la publicación, como «Agregar a la colección, [título]», «Compartir, [título]» y «Más, [título]».
- Reconoce el prefijo de las acciones conocidas de cada tarjeta. Conserva la comparación exacta de Eliminar dentro del menú; no recorta nombres de opciones destructivas.
- Admite el botón Más observado con `aria-haspopup="dialog"`, identificado por su acción. El menú real sigue teniendo `role="menu"` y Eliminar, `role="menuitem"`.
- Distingue el indicador estático de carga al pie de la lista, presente mientras los controles siguen disponibles, de indicadores que bloquean la página. Se usa para esperar nuevas tarjetas al hacer scroll, sin impedir iniciar sobre las ya cargadas.
- Permite verificar la desaparición del último elemento cargado mientras permanece la estructura de la lista con su indicador de continuación.
- Añade pruebas con controles `div[role="button"]`, nombres con títulos, contenedores anidados y carga al pie. La inspección real no ejecutó eliminaciones; el ciclo completo con una cuenta real sigue requiriendo una prueba supervisada.

## 1.0.2 — 15 de noviembre de 2026

- Identifica el área que contiene tarjetas de Guardados por sus controles, menú y enlace, sin exigir que toda la página tenga un único `main` o `role="main"`.
- Admite áreas principales hermanas y anidadas que representan una misma lista. Conserva la detención si hay dos listas independientes o tarjetas fuera del área identificada.
- Reconoce el título «Guardado», en singular, observado en la captura del usuario.
- Conserva el contexto de la lista cuando un menú oculta el fondo para accesibilidad o desaparece la última tarjeta, sin cambiar a la barra lateral.
- Respeta la carga indicada en un contenedor antecesor y añade pruebas de Chromium para estas variantes del DOM.

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
