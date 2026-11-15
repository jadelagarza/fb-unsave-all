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

- se seleccione, confirme y observe la carga antes de recargar;
- el último lote también se recargue, se conserve el progreso y no se exceda el límite;
- varios lotes continúen sólo en el nuevo documento y finalicen ante una lista explícitamente vacía;
- no se recargue cuando falta el indicador, sigue cargando o el usuario detuvo el proceso;
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

Reconoce indicadores visibles con `role="progressbar"`, `aria-busy="true"`, o una etiqueta accesible `Cargando`, `Cargando...`, `Loading` o `Loading...`. Observa mutaciones antes del clic de confirmación y exige un periodo estable sin carga. Un indicador sólo gráfico sin esas señales no se reconoce: el resultado es una detención, no un temporizador que recarga a ciegas.

La casilla se localiza por su nombre accesible exacto. El contador admite formatos como `20 elementos seleccionados`, `20 seleccionados`, `20 items selected`, `20 selected` o un número sin texto, como `16`. Se busca exclusivamente en el contenedor común más pequeño de la casilla Todo marcada y los botones Desmarcar y Eliminar. Ese contenedor debe estar separado del área principal y no contener filas, artículos ni otras casillas: los números o textos de las publicaciones nunca se usan como contador. Valores distintos dentro de esa barra se consideran ambiguos y bloquean la eliminación. La confirmación se busca en un único `role="dialog"` o `role="alertdialog"` con Cancelar y Eliminar. Más de un candidato implica detenerse.

La huella de progreso resume el texto visible del área principal antes de seleccionar. Evita reintentar una lista aparentemente idéntica después de recargar, pero puede bloquear dos lotes con texto idéntico o no detectar cambios ajenos al borrado. La revisión manual de Guardados sigue siendo necesaria.

El estado en `chrome.storage.session` se lee y modifica sólo desde el service worker. Los mensajes se serializan para evitar que una actualización atrasada sobrescriba una detención. Cada acción comprueba la ejecución, la pestaña, el documento y la categoría antes de continuar. Hay un pequeño intervalo inevitable entre la última comprobación y el clic; Detener no puede recuperar una solicitud ya enviada.

## Validación con una cuenta real

Esta versión debe revisarse primero con un máximo de **1 lote**. Comprueba el título, la casilla, el contador, los dos botones Eliminar, la señal accesible de carga, su desaparición y la recarga. Luego verifica el resultado en Guardados. No declares compatibilidad con una versión real de Facebook a partir de la fixture.

Para cambiar selectores, añade un caso de prueba que represente el cambio y conserva las comprobaciones de categoría y confirmación. No añadas técnicas para eludir bloqueos ni registres contenido, cookies, tokens o contraseñas.
