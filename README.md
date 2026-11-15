# FB Unsave All

Extensión local de Google Chrome para quitar los elementos guardados de tu cuenta de Facebook mediante sus controles visibles.

**Versión 1.0.4.** Permite eliminar uno por uno desde [Guardados](https://www.facebook.com/saved/), con espera configurable, cuenta regresiva y desplazamiento automático. Reconoce nombres accesibles como «Agregar a la colección, [título]» y «Más, [título]», y distingue la carga de más tarjetas al pie de la lista de una carga que bloquea los controles. Conserva la limpieza por lotes del Registro de actividad y muestra el resultado o error de la comprobación junto al botón.

[English guide](docs/README.en.md) · [Desarrollo y pruebas](docs/DEVELOPMENT.md) · [Historial de cambios](CHANGELOG.md)

## Elegir un modo

| Modo del panel | Funcionamiento | Uso |
| --- | --- | --- |
| **Guardados: uno por uno** (predeterminado) | Abre los tres puntos de una tarjeta, pulsa Eliminar, verifica que desaparezca y espera antes de continuar. Hace scroll para acceder a los botones y cargar más tarjetas. No recarga entre elementos. | Limpiar desde `/saved/`, incluso cuando el Registro de actividad omite guardados antiguos. |
| **Registro de actividad: lotes** | Marca Todo, lee el contador, pulsa Eliminar y confirma. Espera a que la página vuelva a estar disponible, recarga y comprueba el resultado antes de continuar. | Usar los controles de selección por lotes de Facebook. |

La extensión quita referencias de tus guardados; no elimina las publicaciones originales. No ofrece una función para restaurar guardados eliminados. Las pausas **no garantizan evitar restricciones o verificaciones de Facebook**.

Las pruebas automatizadas utilizan páginas simuladas con la extensión instalada en Chromium. En 1.0.3 se inspeccionaron los controles y el menú de una página real, sin ejecutar eliminaciones; sus nombres incluyen el título de la publicación. Esto no equivale a verificar todo el ciclo real de eliminación: empieza con **1 elemento**. Facebook puede cambiar la interfaz o dejar de entregar tarjetas; una ejecución terminada no demuestra por sí sola que toda la cuenta esté vacía.

## Requisitos

- Google Chrome de escritorio 120 o posterior, en macOS, Windows o Linux.
- Una sesión iniciada por ti en `https://www.facebook.com`.
- Facebook en español o inglés, con los controles descritos en este documento.

No necesitas Node.js, instalar paquetes, exportar cookies ni pegar código en la consola para usar la extensión. Chrome para iPhone y Android no permite cargar esta extensión de escritorio.

## Instalación

1. Descarga el repositorio con **Code → Download ZIP** y descomprímelo. También puedes clonarlo:

   ```bash
   git clone https://github.com/jadelagarza/fb-unsave-all.git
   ```

2. Abre `chrome://extensions` y activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta **`extension`**, que contiene `manifest.json`. No selecciones la raíz del repositorio.
5. Abre **FB Unsave All** en el menú de extensiones de Chrome; puedes fijarla para tenerla a mano.
6. Si Facebook ya estaba abierto, recarga esa pestaña una vez para activar el script.

Mantén la carpeta en el mismo lugar mientras esté instalada. Este proyecto no tiene una publicación oficial en Chrome Web Store.

### Actualizar desde una versión anterior

1. Detén cualquier ejecución activa.
2. Descarga la versión actual o ejecuta `git pull` en tu clon.
3. En `chrome://extensions`, pulsa **Recargar** en FB Unsave All y comprueba la versión **1.0.4**, también visible en la cabecera del panel.
4. Recarga Facebook una vez. Esta recarga es necesaria para reemplazar el script anterior.
5. Abre de nuevo el panel y selecciona el modo deseado. El modo predeterminado ahora es **Guardados: uno por uno**.

## Guardados: uno por uno, con scroll automático

1. Inicia sesión en Facebook por tu cuenta.
2. Selecciona **Guardados: uno por uno** en el panel.
3. Pulsa **1. Abrir mis elementos guardados**, o entra en [facebook.com/saved/](https://www.facebook.com/saved/). Abre la vista general de todos los guardados, fuera de una colección. Para recorrer la lista desde el principio, empieza arriba.
4. Espera a que aparezcan tarjetas. Puedes haber deslizado para cargar varias; también se cargarán más conforme haga falta. Deja cerrados los menús y diálogos de Facebook.
5. Pulsa **2. Comprobar esta página**. Verás **Comprobando…** inmediatamente y después el resultado o error debajo del botón. Si todo está listo, indicará cuántas tarjetas reconoce; esta cantidad **no es el total de guardados de la cuenta**. Comprobar no elimina elementos.
6. Para la primera prueba, configura **Máximo de elementos: 1** y **Espera entre elementos: 4**.
7. Marca la casilla de aceptación y pulsa **3. Iniciar limpieza**. La casilla es obligatoria en ambos modos; no necesitas volver a marcarla para cada elemento de esa ejecución.
8. Comprueba que se quitó el elemento esperado. Después puedes iniciar otra ejecución con un límite mayor o con **0** para continuar mientras se encuentren tarjetas.

### Parámetros

| Campo | Predeterminado | Valores | Significado |
| --- | --- | --- | --- |
| Máximo de elementos | `0` | Entero de `0` a `100000` | `0`: continuar hasta que no se encuentren más tarjetas al desplazar. Un valor positivo limita las eliminaciones verificadas de esa ejecución. |
| Espera entre elementos (s) | `4` | Entero de `1` a `3600` | Tiempo mínimo después de verificar una eliminación y antes de abrir el siguiente menú. |

Cada ciclo hace lo siguiente:

1. Reconoce una tarjeta por sus controles y enlaces; vuelve a consultar el DOM para tolerar que Facebook lo reconstruya.
2. Desplaza la tarjeta a la vista si hace falta y abre **sus tres puntos**, sin pulsar Compartir ni Agregar a colección.
3. Busca **Eliminar** dentro del menú recién abierto. También reconoce las variantes exactas documentadas en el adaptador para español e inglés. Nunca busca un Eliminar genérico por toda la página.
4. Pulsa esa opción una sola vez y comprueba que la tarjeta ya no esté en la lista, sin carga ni diálogo pendientes, durante un segundo estable. Si no puede verificarlo, se detiene sin reintentar ni recargar.
5. Aumenta el contador, espera los segundos configurados y continúa.
6. Cuando no quedan tarjetas pendientes reconocibles, desplaza el área de la lista para cargar más. Si Facebook muestra carga, espera a que termine; si no aparecen nuevas tarjetas tras tres intentos de desplazamiento, finaliza explicando esa limitación.

El tiempo real entre clics será mayor que la pausa configurada, porque incluye la respuesta de Facebook y su comprobación. No hay recarga entre elementos: se conserva la lista cargada. Si aparece un diálogo de confirmación diferente o una interfaz desconocida, la extensión se detiene para revisión.

Durante la pausa, el panel muestra el tiempo restante: **4 s → 3 s → 2 s → 1 s**. Se calcula con la hora de fin de la pausa; si cierras y reabres el panel, muestra lo que realmente queda. También funciona entre lotes. El contador no modifica la espera ni indica que ya haya comenzado la siguiente eliminación.

## Registro de actividad: lotes

1. Selecciona **Registro de actividad: lotes** y pulsa **Abrir mis elementos guardados**.
2. Si el enlace no funciona, navega por **Configuración y privacidad → Registro de actividad → Tu actividad en Facebook → Elementos guardados y colecciones → Tus elementos guardados**.
3. Deja Todo sin marcar y cierra los diálogos. Pulsa **Comprobar esta página**.
4. Empieza con **Máximo de lotes: 1**, **Pausa entre lotes: 10 s**, marca la aceptación e inicia.
5. Revisa el resultado antes de aumentar el límite. Facebook decide cuántos elementos carga por lote; no se presupone que sean 20.

Se permite un máximo de `1` a `500` lotes y una pausa de `3` a `3600` segundos. El script lee el contador únicamente en la barra que reúne Todo, Desmarcar y Eliminar, acepta un número sin texto y confirma en el diálogo con Cancelar y Eliminar.

Detecta señales de carga y capas que bloquean la página. Cuando la selección se restablece y la interfaz permanece disponible durante 1.5 segundos, solicita una recarga normal con `chrome.tabs.reload`. También admite una recarga de verificación si Facebook conserva las filas antiguas hasta recargar. **Los contadores avanzan sólo después de comprobar progreso en la página nueva**. Si reaparece la misma lista, se detiene sin contar ni repetir ese lote. El último lote también se recarga y verifica.

Si Facebook deja de mostrar elementos anteriores a cierta fecha en el Registro de actividad, utiliza el modo **Guardados: uno por uno**. La extensión no puede obligar a Facebook a entregar datos que la página no proporciona.

## Detener y comprobar el resultado

- Pulsa **Detener ejecución** para evitar los siguientes clics. Una solicitud de eliminación que ya se envió no puede cancelarse desde el panel.
- Cerrar el panel no detiene la ejecución. Cerrar la pestaña de Facebook sí la detiene.
- Mantén Chrome abierto y la pestaña de Facebook visible. Evita manipular sus controles, cambiar de perfil, navegar o recargar manualmente durante la ejecución.
- Una recarga inesperada bloquea la continuación; revisa el resultado y empieza una ejecución nueva.
- El estado es temporal, en la sesión de Chrome. No hay reanudación automática después de reiniciar el navegador.
- Al terminar, revisa Guardados por tu cuenta. «No aparecieron más tarjetas» significa que Facebook no entregó más en ese recorrido, no que se hayan verificado todos los guardados del servidor.

## Resolver problemas

| Síntoma | Qué hacer |
| --- | --- |
| Pulsas Comprobar y parece que no ocurre nada | Actualiza a 1.0.3, recarga la extensión y después Facebook. Ahora muestra Comprobando y después el resultado o error junto al botón. Si la página no responde, informa el tiempo de espera agotado; no comienza a eliminar. |
| «Se esperaba un único área principal… se encontraron 2» | Actualiza a 1.0.3 y recarga la extensión y Facebook. Se identifica el área que contiene las tarjetas, con sus controles y enlaces, aunque haya otra área principal o contenedores anidados. |
| «No se pudo identificar el área» aunque las tarjetas están cargadas | Actualiza a 1.0.3. Los nombres accesibles reales pueden incluir el título después de «Agregar a la colección» o «Más»; antes se comparaba el nombre completo con un texto corto y se descartaban esas tarjetas. |
| «Áreas independientes» o «tarjetas fuera del área identificada» | Hay más de una lista reconocible y no se puede escoger una con certeza. La ejecución se detiene antes de abrir menús. Revisa la vista y reporta el mensaje exacto. |
| No se reconoce una tarjeta o su menú | Comprueba que estés en la vista general de Guardados, en español o inglés, con tarjetas cargadas y los tres botones indicados. Guarda el mensaje exacto para reportarlo. |
| Eliminar no aparece en el menú | La extensión se detiene. No se pulsa otra opción parecida ni un botón de otra parte de la página. |
| Se quitó una tarjeta pero no avanza el contador | No pudo verificar su desaparición con la interfaz disponible. Revisa manualmente, detén la ejecución y vuelve a comprobar la página. No se repite la eliminación automáticamente. |
| Termina aunque sabes que quedan guardados | Facebook puede estar limitando la carga, haber virtualizado tarjetas o mostrar un filtro. Vuelve a la vista general, revisa por tu cuenta y comienza otro recorrido desde arriba si corresponde. |
| No se pudo comprobar la cantidad seleccionada | Este mensaje corresponde al modo por lotes. Actualiza, recarga la extensión y Facebook, y prueba un lote. |
| CAPTCHA, solicitud de contraseña, bloqueo o verificación | Detén el proceso y resuelve la situación manualmente. |
| Actualizaste los archivos pero ves el comportamiento anterior | Recarga la extensión en `chrome://extensions` y después la pestaña de Facebook. |

Para reportar un problema, incluye versión de la extensión, versión de Chrome, idioma, modo elegido y mensaje exacto. Oculta los datos privados en capturas. **No compartas contraseñas, cookies, tokens ni archivos de sesión.**

## Privacidad y permisos

El código está incluido en `extension/`; no descarga código remoto, no añade analítica ni servidores propios y no consulta APIs privadas de Facebook. Los clics activan las solicitudes normales de la página.

El permiso `storage` guarda estado y contadores en memoria de sesión. El acceso a `https://www.facebook.com/*` permite leer y modificar el DOM y reinyectar el script después de las recargas del modo por lotes. No se solicitan permisos de cookies, historial o contraseñas. Las identidades de tarjetas se representan mediante hashes locales; no se almacenan textos ni enlaces de publicaciones en el estado de la extensión.

No se incluyen técnicas para ocultar la automatización ni eludir controles. Consulta las [condiciones de Facebook](https://www.facebook.com/legal/terms). El proyecto no está afiliado a Meta.

## Desinstalar y desarrollar

En `chrome://extensions`, pulsa **Quitar** en FB Unsave All. Esto no restaura los guardados eliminados.

Consulta [DEVELOPMENT.md](docs/DEVELOPMENT.md) para ejecutar pruebas y contribuir. Código bajo [licencia MIT](LICENSE).
