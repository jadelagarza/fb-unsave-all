# Desarrollo y validación

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `extension/manifest.json` | Extensión Manifest V3, acceso sólo a `www.facebook.com` y almacenamiento de sesión. |
| `extension/core.js` | Adaptador DOM: categoría, casilla, contador, botones, diálogo, indicadores y mensajes. |
| `extension/saved.js` | Adaptador de `/saved/`: tarjetas, identidad, menú, desaparición y área desplazable. |
| `extension/saved-content.js` | Ciclo secuencial, espera configurable y descubrimiento de nuevas tarjetas mediante scroll. |
| `extension/content.js` | Despacho según modo y ciclo por lotes con recarga. |
| `extension/background.js` | Propiedad de la ejecución por pestaña/documento, persistencia de sesión y recarga normal. |
| `extension/popup.*` | Apertura, inspección sin cambios, configuración, inicio y detención. |
| `tests/lifecycle.test.cjs` | Pruebas con reloj y adaptador simulados: secuencia, límites, fallos y cancelación. |
| `tests/browser.test.cjs` | Extensión instalada en Chromium con HTML simulado y red interceptada. |
| `tests/saved.test.cjs` | Reloj simulado y protocolo de eliminación individual, pausas, scroll, límites y cancelación. |
| `tests/saved.browser.test.cjs` | DOM simulado de Guardados, menús, reconstrucción de tarjetas, carga por scroll y panel. |
| `tests/popup.test.cjs` | Clic de comprobación, mensajes visibles, bloqueo de clics duplicados, tiempos de espera y respuestas tardías. |

No hay proceso de compilación ni dependencias de ejecución. El usuario carga directamente `extension/`.

## Pruebas sin dependencias

Instala Node.js 22 o posterior. Desde la raíz del repositorio:

```bash
npm ci --ignore-scripts
npm run check
npm test
```

Las pruebas de ciclo ejecutan el código real de `background.js` y `content.js` en contextos VM, con un adaptador DOM y APIs de Chrome simulados. Verifican que:

- se seleccione, confirme y compruebe el fin de la eliminación antes de recargar;
- el último lote también se recargue, se conserve el progreso y no se exceda el límite;
- varios lotes continúen sólo en el nuevo documento y finalicen ante una lista explícitamente vacía;
- no se recargue si faltan tanto el indicador como evidencia verificable, si sigue cargando, si la selección no se restablece o si el usuario detuvo el proceso;
- una lista sin cambios, una interfaz desconocida o una verificación bloqueen la ejecución;
- otra pestaña/documento no pueda continuar una ejecución, y una recarga inesperada la bloquee;
- una recarga no autorizada por el estado se rechace.

Estas pruebas no verifican el DOM de Facebook ni el comportamiento de Chrome real.

## Pruebas de extensión en Chromium

Playwright se usa sólo como herramienta opcional de desarrollo. No hace falta para usar la extensión:

```bash
npm install --no-save --package-lock=false --ignore-scripts playwright@1.62.1
npx playwright install chromium
npm run test:browser
```

En Linux, puede ser necesario usar `npx playwright install --with-deps chromium`. Si ya tienes un Chromium compatible instalado, puedes indicar su ruta con la variable `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

La suite carga la extensión sin empaquetar en un perfil temporal. Intercepta todas las solicitudes HTTP y responde a la URL de Facebook con `tests/fixture.cjs` o `tests/saved-fixture.cjs`; el resto de solicitudes HTTP se bloquea. No inicia sesión ni elimina datos reales. Comprueba ambos modos, la reinyección tras recarga del modo por lotes y los casos de categoría incorrecta, indicador ausente, falta de progreso y alerta de seguridad.

GitHub Actions ejecuta la comprobación de sintaxis, las pruebas de ciclo y las pruebas de Chromium. Consulta el resultado de la ejecución asociada al commit; tener el archivo del workflow no demuestra que haya pasado.

## Compatibilidad y decisiones conservadoras

### Comprobación del panel

Comprobar es una operación de lectura. El panel cambia inmediatamente a Comprobando, deshabilita acciones incompatibles y muestra éxito o error en `#inspection`, junto al botón, con `role="status"` y `aria-busy`. Los errores de otras acciones también están antes del formulario, y se desplazan a la vista cuando proceden de una acción del usuario. La cabecera muestra la versión real del manifiesto.

El service worker limita la respuesta del script de página a 8 segundos; esto libera su cola serializada si una pestaña deja de responder. El panel tiene además un límite de 10 segundos para la inspección y de 3 para la consulta de estado. Esos límites del panel sólo abandonan peticiones de lectura, no Start o Stop. Un fallo de la inspección previa a Start impide crear la ejecución, incluso si llega una respuesta tardía. Se valida la forma de la respuesta y el modo Guardados para detectar scripts antiguos.

Durante una comprobación se omiten consultas periódicas de estado para que no se acumulen detrás de ella. Las pruebas de Chromium activan el botón real del DOM del panel y comprueban el mensaje de error en una vista de 380 × 600, además de comprobar que esa acción no elimina datos de la fixture.

Durante `cooldown`, el panel calcula los segundos restantes desde `run.notBefore` y `Date.now()`, redondeando hacia arriba y sin mostrar valores negativos. El texto se revisa localmente cada 250 ms y sólo se modifica si cambia; no añade mensajes al service worker ni cambia la pausa. Al reabrir el panel se recupera la misma hora límite. Fuera de una ejecución activa en pausa, se muestra el mensaje de estado normal.

### Guardados: uno por uno

Exige la ruta `/saved/`, origen exacto `https://www.facebook.com` y un título reconocido en español o inglés, incluido «Guardado» en singular. Rechaza rutas de colecciones y parámetros de colección. No confunde una lista sin tarjetas reconocibles con una cuenta vacía.

Desde 1.0.2 no exige que toda la página tenga una sola área principal. Evalúa los contenedores `main` y `role="main"` mediante tarjetas reconocibles: Agregar a colección, un menú de la tarjeta y un enlace fuera del grupo de acciones. Ignora áreas sin esa estructura. Si varios contenedores anidados representan la misma lista, elige el interior; comprueba que no queden tarjetas reconocibles fuera de él en un antecesor. Dos listas independientes o tarjetas adicionales fuera del área elegida bloquean la operación antes de abrir menús. Un botón Agregar a colección aislado en otra sección no basta para identificar otra lista.

El área ya reconocida se conserva mientras su último elemento desaparece o carga, sin elegir la barra lateral restante. Si un menú la oculta sólo para accesibilidad, se admite exclusivamente ese contenedor previamente verificado en el documento y URL actuales. También se reconoce `aria-busy` en sus antecesores. Las pruebas reproducen áreas hermanas, anidadas, dos listas independientes, tarjetas fuera de una lista anidada, menú con fondo oculto y lista vacía junto a una barra lateral.

Cada tarjeta se ancla a un único botón Agregar a colección y un enlace de contenido. Se abre Más/Más opciones o un único botón con `aria-haspopup="menu"`. También admite el tercer botón sin nombre en un grupo exacto de tres controles cuyo primero sea Agregar a colección. Esa alternativa sólo abre el menú: para eliminar sigue siendo obligatoria una opción exacta dentro de un único menú nuevo, o el menú asociado mediante `aria-controls`. Los nombres admitidos están centralizados en `saved.js`; no se pulsa un Eliminar genérico ni «Eliminar colección».

Desde 1.0.5 se reconoce también la etiqueta observada «Más opciones para el elemento guardado». Una acción Más reconocida no requiere que exista Compartir: admite grupos de dos o tres controles. Las pruebas mezclan una tarjeta normal de tres controles, otra de dos con la etiqueta nueva y otra de dos con Más y contexto del título. La alternativa posicional para botones sin nombre sigue limitada al grupo exacto de tres; un segundo botón desconocido con `aria-haspopup="dialog"` se rechaza sin abrir menús.

La inspección de una página real para 1.0.3 confirmó que los controles son `div[role="button"]` y que sus etiquetas accesibles añaden una coma y el título de la publicación. `actionName` reconoce sólo prefijos de acciones conocidas (Agregar a la colección, Compartir, Más y variantes declaradas). No aplica ese recorte a Eliminar. Así, un título que contenga «compartir» o «share» no provoca que se descarte el botón Más. El botón Más observado usa `aria-haspopup="dialog"`, pero el menú desplegado es `role="menu"` y su acción Eliminar es `role="menuitem"`.

También se observó un `role="status"` con `data-visualcompletion="loading-state"` y etiqueta Cargando... al pie de la lista, fuera de la vista inicial. Es un indicador estático después de las tarjetas, sin controles dentro ni capas fijas o absolutas en sus antecesores hasta la lista. `footerLoaders` identifica esa estructura por los controles anteriores y sus atributos; `loading` no la considera bloqueo de los elementos existentes, mientras `moreLoading` la conserva como espera al solicitar más datos mediante scroll. Una lista ya verificada que conserva ese indicador permite comprobar la desaparición del último elemento cargado antes de buscar más. Los indicadores restantes y `aria-busy` siguen bloqueando acciones.

Las pruebas reproducen estos atributos con títulos y enlaces sintéticos. No guardan HTML, títulos, enlaces ni identificadores de la cuenta inspeccionada. La inspección confirmó la estructura y abrió/cerró un menú; no ejecutó Eliminar. Ese alcance debe distinguirse de verificar el ciclo completo de eliminación sobre una cuenta real.

La identidad se calcula con los enlaces de la tarjeta, normalizados para ignorar parámetros de seguimiento conocidos. Desde 1.0.6, la página de inicio de Facebook sin parámetros y las rutas de colecciones se consideran enlaces genéricos, sin identidad de elemento. Si no hay otros enlaces, se usa el título que acompaña a la etiqueta de Agregar a colección; como alternativa, el texto visible de los enlaces genéricos de inicio. Nunca se usa el nombre de la colección como título. El respaldo no contiene precio, texto completo de la tarjeta ni índice de posición, y permanece estable cuando Facebook reconstruye el DOM.

El resultado siempre se representa mediante un hash; no se guardan enlaces ni títulos en almacenamiento. La falta de información identificable o las identidades duplicadas siguen bloqueando el proceso. Las pruebas reproducen productos diferentes con el mismo enlace de inicio, títulos iguales que deben bloquearse y una variación del precio sin eliminación que no puede aumentar el contador. Después de cada cambio se consulta otra vez el DOM; no se conserva una lista fija de nodos para hacer clic. La visibilidad de lectura de tarjetas admite un fondo oculto sólo para accesibilidad mientras está abierto el menú, conservando el área ya reconocida en esa URL. Los objetivos del clic deben ser visibles, estar habilitados y superar una comprobación de intercepción.

Desde 1.0.7 hay una excepción estructural para tarjetas vacías: sin identidad por enlace o título, con metadatos de tipo reconocidos como Reel y un grupo de acciones válido. `identity` devuelve null y `readCard` exige esos metadatos fuera del grupo de acciones antes de marcarla `anonymous`. El color de la miniatura no se utiliza. Las claves identificables duplicadas siguen bloqueando la lista; varias tarjetas anónimas no se convierten en claves por posición.

Antes del clic destructivo, `captureAnonymous` conserva el control de menú mediante su referencia DOM, el número de tarjetas anónimas y las claves de todos los elementos identificables. `anonymousTargetReady` comprueba el mismo control y la misma composición después de la última comunicación con el service worker. El selector del menú y la coincidencia exacta de Eliminar no se relajan.

La verificación posterior requiere exactamente una tarjeta anónima menos y el mismo conjunto de claves identificables, sin altas ni bajas, durante 1.5 segundos y con la interfaz disponible. Esto permite que Facebook reconstruya los nodos sin depender de sus referencias después de eliminar. Si una tarjeta vacía adquiere un título o enlace, cambia el conjunto de identificables y no se cuenta como eliminación. Cambios concurrentes de la lista, virtualización o la llegada de otra tarjeta vacía pueden impedir demostrar el resultado; se detiene sin reintentar.

Los tokens `anonymous-N` distinguen operaciones dentro de una ejecución, no publicaciones ni posiciones de la lista. `saved-pending` registra el tipo y la cantidad inicial; `saved-completed` exige el token pendiente, el mismo tipo, una reducción de uno y evidencia de pares intactos. La cantidad inicial puede superar el máximo configurado, porque el límite sólo restringe cuántas eliminaciones se autorizan. El descubrimiento cuenta claves identificables vistas, tarjetas anónimas ya procesadas y las presentes. El límite y la pausa siguen aplicándose a ambos tipos.

El ciclo comprueba la autorización por ejecución, pestaña y documento antes de cada acción. `saved-plan` comunica cuántas identidades se han descubierto; sólo puede crecer, sin superar el máximo configurado. `saved-pending` registra el hash de una única tarjeta y exige que haya terminado la pausa. `saved-completed` sólo cuenta el elemento pendiente desde la fase waiting con evidencia explícita. No admite duplicar ese mensaje ni recargar mediante el protocolo del modo por lotes.

Tras Eliminar se espera la ausencia de la identidad, una lista reconocible o vacío explícito, sin carga ni menú o diálogo pendiente y con un segundo de estabilidad. Tiempo máximo: 30 segundos. No se usa la desaparición del spinner por sí sola. Si Facebook presenta una confirmación nueva o conserva una tarjeta sin señales verificables, se detiene sin repetir clics ni hacer recargas de rescate.

La pausa de 1 a 3600 segundos (4 predeterminado) comienza después de verificar cada eliminación y se espera antes de abrir otro menú. La última eliminación no requiere una pausa adicional. Un máximo de 0 permite seguir mientras se encuentren tarjetas. Las identidades ya procesadas se conservan sólo en memoria del documento para no repetirlas si vuelven a renderizarse.

Cuando se agotan las tarjetas reconocidas pendientes, se desplaza el ancestro con desplazamiento vertical o el documento, aproximadamente una pantalla. Se esperan hasta 2.5 segundos por intento, ampliados mientras haya carga visible, con límite de 30 segundos de carga y tres intentos sin nuevas tarjetas. Al agotarse esos intentos se informa que no aparecieron más datos; sólo un mensaje explícito se describe como vista vacía. No se afirma haber consultado todo el servidor. La virtualización, los filtros, los cambios de enlaces o un indicador no reconocido pueden limitar el recorrido y requieren revisión real.

### Registro de actividad

El adaptador exige la ruta `/…/allactivity/` y un título visible exacto **Tus elementos guardados** o **Your saved items**. No usa selectores de clases generadas, coordenadas, APIs internas, credenciales o una lista de IDs de publicaciones.

Reconoce indicadores visibles con `role="progressbar"`, `aria-busy="true"`, `data-visualcompletion="loading-state"`, o una etiqueta accesible / `aria-valuetext` con `Cargando`, `Cargando...`, `Loading` o `Loading...`. **Corrección de la inspección anterior:** el `div` global con `role="progressbar"` observado en 0.1.2 mide 4px de alto y está en la parte superior; es una barra de navegación, no el círculo central de eliminación. Desde 0.1.4 se excluye esa barra como evidencia de carga de eliminación.

La detección visual deriva el punto de interacción del rectángulo de Todo y comprueba qué elemento lo intercepta. Busca una capa fija o absoluta que ocupe una parte grande de la vista, no contenga controles interactivos y contenga un anillo SVG con trazo o una animación pequeña de carga. Para esos gráficos decorativos se usa visibilidad CSS, sin confundir `aria-hidden` con invisibilidad visual. Los controles sobre los que se hace clic conservan sus comprobaciones accesibles. No se usan coordenadas fijas, clases generadas ni contenido privado de la cuenta.

La visibilidad comprueba el indicador y sus antecesores: un nodo eliminado, sin rectángulos de presentación, con `display: none`, `visibility: hidden/collapse`, opacidad cero o dentro de un área oculta deja de contar como carga. Mientras la capa global está activa puede conservarse el contexto de guardados ya verificado si Facebook oculta el fondo para accesibilidad; esto no autoriza una URL o categoría nuevas.

Observa mutaciones antes del clic de confirmación. Para recargar exige que no haya carga ni diálogo, que la selección y los controles se restablezcan y que el resultado sea estable durante 1.5 segundos. El panel indica cuándo se ha detectado la carga. Las pruebas reproducen una capa global que permanece en el DOM después de ocultarse, variantes de opacidad/antecesor oculto/eliminación del nodo, un fondo oculto para accesibilidad y una capa que sigue visible y no debe recargarse.

Antes de confirmar también captura hashes locales de las identidades de los elementos seleccionados (nombres accesibles y enlaces de sus filas). Si el indicador no fue observable, sólo permite la recarga cuando todos los elementos capturados desaparecieron y queda otra lista, o hay un mensaje explícito de vacío sin casillas de elementos. La selección debe estar restablecida y el resultado estable. Si no pudo capturar todos los elementos seleccionados, la vía de desaparición de filas no se utiliza. No guarda esos textos o enlaces ni añade consultas al servidor.

El protocolo admite `loading`, `items-removed`, `empty` y `readiness`, almacenados como `lastCompletionKind`. `readiness` sólo autoriza una recarga para verificar: después de confirmar Delete, exige selección restablecida, controles de eliminación inactivos, Todo disponible sin interceptores y 1.5 segundos de estabilidad. Esto cubre el caso real donde las filas antiguas siguen visibles hasta recargar. No se interpreta como prueba definitiva de eliminación.

La recarga conserva `pendingSelected`; todavía no aumenta los contadores. En el documento nuevo se compara la huella con la lista anterior. Si la lista sigue igual se bloquea sin contar el lote ni repetir la eliminación. Si hay progreso o vacío, la fase `verifying` confirma el lote pendiente una sola vez y sólo entonces decide si continuar o respetar el máximo. Los tiempos límite nunca producen una recarga automática por sí solos.

«No hay nada para mostrar» se reconoce también cuando Todo y Eliminar permanecen deshabilitados. Si aparece después de confirmar, termina sólo el lote y obliga a recargar. Las pruebas incluyen cinco lotes con un anillo SVG decorativo sin metadatos de carga, barra de navegación visible y filas antiguas que se actualizan sólo al recargar; una capa que sigue bloqueando tras desmarcar la selección; y recargas de verificación que no confirman progreso y deben terminar sin contar ni repetir el lote.

La casilla se localiza por su nombre accesible exacto. El contador admite formatos como `20 elementos seleccionados`, `20 seleccionados`, `20 items selected`, `20 selected` o un número sin texto, como `16`. Se busca exclusivamente en el contenedor común más pequeño de la casilla Todo marcada y los botones Desmarcar y Eliminar. Ese contenedor debe estar separado del área principal y no contener filas, artículos ni otras casillas: los números o textos de las publicaciones nunca se usan como contador. Valores distintos dentro de esa barra se consideran ambiguos y bloquean la eliminación. La confirmación se busca en un único `role="dialog"` o `role="alertdialog"` con Cancelar y Eliminar. Más de un candidato implica detenerse.

La huella de progreso resume el texto visible del área principal antes de seleccionar. Evita reintentar una lista aparentemente idéntica después de recargar, pero puede bloquear dos lotes con texto idéntico o no detectar cambios ajenos al borrado. La revisión manual de Guardados sigue siendo necesaria.

El estado en `chrome.storage.session` se lee y modifica sólo desde el service worker. Los mensajes se serializan para evitar que una actualización atrasada sobrescriba una detención. Cada acción comprueba la ejecución, la pestaña, el documento y la categoría antes de continuar. Hay un pequeño intervalo inevitable entre la última comprobación y el clic; Detener no puede recuperar una solicitud ya enviada.

## Validación con una cuenta real

En Guardados, empieza con un máximo de **1 elemento** y 4 segundos. Verifica el título, que se abra el menú de la tarjeta correcta, la opción Eliminar y su desaparición. Después prueba un límite pequeño mayor que las tarjetas inicialmente cargadas para comprobar el scroll y la llegada de nuevas tarjetas. No pruebes con datos reales como parte de CI.

En Registro de actividad, empieza con un máximo de **1 lote**. Comprueba título, casilla, contador, ambos botones Eliminar, fin de carga y recarga. Luego revisa Guardados. No declares compatibilidad con una versión real de Facebook a partir de las fixtures.

Para cambiar selectores, añade un caso de prueba que represente el cambio y conserva las comprobaciones de categoría y confirmación. No añadas técnicas para eludir bloqueos ni registres contenido, cookies, tokens o contraseñas.
