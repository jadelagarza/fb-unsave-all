# Desarrollo y validación

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `extension/manifest.json` | Extensión Manifest V3, acceso sólo a `www.facebook.com` y almacenamiento de sesión. |
| `extension/core.js` | Adaptador DOM: categoría, casilla, contador, botones, diálogo, indicadores y mensajes. |
| `extension/content.js` | Un lote por documento: selección, confirmación, observación de carga y petición de recarga. |
| `extension/background.js` | Propiedad de la ejecución por pestaña/documento, persistencia de sesión y recarga normal. |
| `extension/popup.*` | Apertura, inspección sin cambios, configuración, inicio y detención. |
| `tests/lifecycle.test.cjs` | Pruebas con reloj y adaptador simulados: secuencia, límites, fallos y cancelación. |
| `tests/browser.test.cjs` | Extensión instalada en Chromium con HTML simulado y red interceptada. |

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

La suite carga la extensión sin empaquetar en un perfil temporal. Intercepta todas las solicitudes HTTP y responde a la URL de Facebook con `tests/fixture.cjs`; el resto de solicitudes HTTP se bloquea. No inicia sesión ni elimina datos reales. Comprueba el DOM de los controles, la reinyección tras recarga y los casos de categoría incorrecta, indicador ausente, falta de progreso y alerta de seguridad.

GitHub Actions ejecuta la comprobación de sintaxis, las pruebas de ciclo y las pruebas de Chromium. Consulta el resultado de la ejecución asociada al commit; tener el archivo del workflow no demuestra que haya pasado.

## Compatibilidad y decisiones conservadoras

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

Esta versión debe revisarse primero con un máximo de **1 lote**. Comprueba el título, la casilla, el contador, los dos botones Eliminar, la señal accesible de carga, su desaparición y la recarga. Luego verifica el resultado en Guardados. No declares compatibilidad con una versión real de Facebook a partir de la fixture.

Para cambiar selectores, añade un caso de prueba que represente el cambio y conserva las comprobaciones de categoría y confirmación. No añadas técnicas para eludir bloqueos ni registres contenido, cookies, tokens o contraseñas.
