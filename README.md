# FB Unsave All

Vacía los elementos guardados de tu cuenta de Facebook mediante los botones del **Registro de actividad**. El script se distribuye como una extensión local de Google Chrome para que pueda continuar después de cada recarga.

[English instructions](docs/README.en.md) · [Detalles de funcionamiento y pruebas](docs/DEVELOPMENT.md)

## Estado del proyecto

**Versión inicial 0.1.0. Pendiente de validar en una cuenta real de Facebook.** La implementación sigue el flujo descrito por el propietario del proyecto. Las pruebas automatizadas usan simulaciones; no demuestran que los selectores coincidan con todas las versiones actuales de Facebook ni garantizan vaciar una cuenta concreta.

La extensión quita referencias de tu lista de guardados. No elimina las publicaciones originales de otras personas. Revisa primero cualquier elemento que quieras conservar: este proyecto no proporciona una función para restaurar los guardados eliminados.

## Qué hace

1. El botón **Abrir mis elementos guardados** abre el enlace del Registro de actividad en tu pestaña de Facebook. Si Facebook cambia ese enlace, puedes navegar manualmente por **Configuración y privacidad → Registro de actividad → Tu actividad en Facebook → Elementos guardados y colecciones → Tus elementos guardados**.
2. Comprueba que la página sea el Registro de actividad y que muestre el título **Tus elementos guardados** o **Your saved items**.
3. Marca la casilla **Todo** y lee la cantidad seleccionada. El tamaño del lote lo decide Facebook; no está fijado a 20 por el script.
4. Pulsa **Eliminar** en la barra y después **Eliminar** dentro del diálogo con **Cancelar**.
5. Espera a observar un indicador de carga y luego su desaparición estable durante 1.5 segundos. También comprueba que el diálogo haya desaparecido.
6. Ejecuta una **recarga normal de la pestaña con `chrome.tabs.reload`**, equivalente a usar el botón de recarga de Chrome. La recarga ocurre después de terminar la carga, incluso en el último lote autorizado.
7. Tras la recarga, comprueba la lista, aplica la pausa configurada y empieza el siguiente lote.

Si el indicador no aparece, no termina o no puede reconocerse, **no recarga a ciegas y no vuelve a pulsar Eliminar**. Se detiene para que revises la página.

## Requisitos

- Google Chrome de escritorio 120 o posterior, en macOS, Windows o Linux.
- Una sesión de Facebook iniciada por ti en `https://www.facebook.com`.
- Facebook en español o inglés, con los controles indicados arriba.
- Acceso al Registro de actividad de tu propio perfil. Las páginas y otros perfiles no se han validado.

No necesitas Node.js, instalar paquetes, exportar cookies ni pegar código en la consola para usar la extensión. Chrome para iPhone y Android no permite cargar esta extensión de escritorio.

## Instalación paso a paso

1. Descarga el repositorio: en GitHub pulsa **Code → Download ZIP** y descomprímelo. También puedes clonarlo:

   ```bash
   git clone https://github.com/jadelagarza/fb-unsave-all.git
   ```

2. Abre `chrome://extensions` en Google Chrome.
3. Activa **Modo de desarrollador**, en la esquina superior derecha.
4. Pulsa **Cargar descomprimida**.
5. Selecciona la carpeta **`extension` dentro del repositorio**, la que contiene `manifest.json`. No selecciones la carpeta raíz del proyecto.
6. Busca **FB Unsave All** en el menú de extensiones de Chrome y fíjala si quieres tenerla a mano.
7. Si Facebook ya estaba abierto antes de instalarla, recarga esa pestaña **una vez** para activar el script.

Mantén la carpeta `extension` en el mismo lugar mientras esté instalada. No hay una publicación oficial de este proyecto en Chrome Web Store.

## Primera ejecución: un lote

1. Abre Facebook e inicia sesión tú mismo. La extensión no gestiona tu contraseña ni la autenticación de dos pasos.
2. Abre el panel de **FB Unsave All** y pulsa **1. Abrir mis elementos guardados**. Este botón puede reemplazar la página de tu pestaña actual de Facebook; no borra elementos por sí solo.
3. Espera a que se muestre **Tus elementos guardados**. Si falla el enlace directo, sigue la ruta manual anterior. Quita los filtros de fecha u otros filtros para trabajar con todo el historial y deja la casilla Todo desmarcada.
4. Vuelve al panel y pulsa **2. Comprobar esta página**. Debe indicar que la reconoce. Esta comprobación no selecciona ni elimina nada.
5. Deja **Máximo de lotes = 1** y **Pausa entre lotes = 10 segundos** para la primera prueba.
6. Lee y marca la confirmación del panel. Pulsa **3. Iniciar limpieza**. Ese botón autoriza las confirmaciones de eliminación del número de lotes configurado.
7. Mantén Chrome abierto y la pestaña de Facebook visible. No cambies de perfil ni uses manualmente esa pestaña durante el ciclo. Cerrar el panel de la extensión no detiene la ejecución.
8. Observa la selección, la confirmación, la carga y la recarga. El panel debe finalizar por alcanzar el límite de un lote.
9. Comprueba en la pantalla **Guardados** que los elementos del lote dejaron de estar guardados. Las pruebas del proyecto no sustituyen esta comprobación en tu cuenta.

## Vaciar el resto

Después de comprobar que un lote funciona, vuelve a **Tus elementos guardados**, sin selección previa. Abre el panel, configura el máximo de lotes que quieres autorizar y comienza una nueva ejecución.

Si Facebook selecciona unos 20 elementos por lote, 1,500 elementos requieren aproximadamente 75 lotes. Un límite de **100 lotes** deja margen y la ejecución termina antes si Facebook muestra explícitamente una lista vacía. **100 es un límite de trabajo, no un límite de seguridad publicado por Meta.** Los contadores se reinician con cada ejecución nueva.

| Control | Valor inicial | Significado |
| --- | --- | --- |
| Máximo de lotes | 1 | Entre 1 y 500. Limita cuántas eliminaciones por lote autorizas. |
| Pausa entre lotes | 10 segundos | Entre 3 y 3,600 segundos. Se cuenta desde el final del lote anterior; la recarga sucede primero. No representa un ritmo garantizado como seguro. |
| Detener ejecución | Disponible al ejecutar | Evita los siguientes pasos cuando el script recibe la orden. Una eliminación ya confirmada no puede deshacerse. |

Los elementos **procesados** se calculan a partir del contador de selección y del ciclo de carga observado. No son una certificación del servidor de Facebook. Una huella local permite detectar que la lista sigue idéntica después de recargar; es una comprobación conservadora, no una prueba absoluta de borrado.

## Cuándo se detiene

- Facebook muestra una lista explícitamente vacía, o se alcanza el máximo de lotes.
- Pulsas **Detener ejecución** o cierras la pestaña autorizada.
- La página, la casilla, el contador o los botones no pueden reconocerse sin ambigüedad.
- No aparece el indicador de carga en 15 segundos o no termina dentro de los 90 segundos siguientes a su detección.
- La lista sigue igual después de recargar, hay una selección manual previa o aparece un mensaje de error o verificación reconocido.
- Recargas manualmente o navegas mientras un lote estaba pendiente. No se reanuda automáticamente una eliminación incierta.

Si se detiene después de confirmar una eliminación, **revisa el resultado antes de iniciar otra ejecución**. No hay reintentos automáticos. La detección de errores depende de textos reconocidos; no cubre todas las alertas posibles de Facebook.

El estado vive en `chrome.storage.session`: sobrevive a las recargas de Facebook y a la suspensión del service worker. Se pierde al cerrar el navegador o al desactivar, actualizar o recargar la extensión. Después de cualquiera de esas acciones, debes iniciar de nuevo; nunca se activa una limpieza por abrir Chrome.

## Problemas frecuentes

| Mensaje o situación | Qué hacer |
| --- | --- |
| «Recarga Facebook una vez…» | Recarga la pestaña después de instalar o actualizar la extensión. |
| No encuentra «Tus elementos guardados» | Comprueba que estés en esa subcategoría del Registro de actividad. La página general Guardados no sirve. |
| El enlace directo abre otra pantalla | Sigue la ruta manual. El script mantiene la comprobación de categoría antes de hacer clic. |
| No encuentra «Todo», el contador o un botón | Detén la ejecución. La interfaz puede haber cambiado o estar en un idioma no compatible. No elimines las comprobaciones para forzarla. |
| No se observó el indicador de carga | Puede que Facebook use un indicador distinto o que el ciclo no haya sido observable. Revisa los guardados manualmente; no se recargará ni repetirá el lote. |
| La lista sigue igual | Revisa si la eliminación funcionó. También puede ser una limitación de la huella si dos lotes tienen el mismo texto. |
| No se declara lista vacía | Si Facebook usa otro mensaje de vacío, el script se detiene por falta de controles reconocibles. Comprueba el estado manualmente. |
| Facebook pide contraseña, CAPTCHA o verificar identidad | Detén la ejecución y resuelve la comprobación manualmente. La extensión no la supera ni intenta eludirla. |
| Cambiaste archivos del repositorio | En `chrome://extensions`, pulsa Recargar en la extensión; luego recarga Facebook. Inicia una ejecución nueva. |

Para reportar un problema, incluye el mensaje exacto, la versión de Chrome, el idioma de Facebook y en qué paso se detuvo. Si compartes una captura, oculta nombres y contenido privado. **No adjuntes cookies, contraseñas, tokens ni archivos de sesión.**

## Privacidad, permisos y restricciones

- Todo el código de la extensión está incluido en `extension/`; no descarga código remoto.
- El permiso `storage` conserva estado temporal y contadores. El acceso a `https://www.facebook.com/*` permite reconocer la página y volver a ejecutar el script después de cada recarga. Ese permiso permite leer y modificar el DOM de Facebook, por lo que debes revisar el código antes de instalarlo.
- No solicita permisos de cookies, historial o contraseñas, y no exporta tu sesión.
- No añade analítica, servidores propios ni solicitudes a APIs privadas de Facebook. Los clics activan las solicitudes normales de la propia página.
- No guarda texto de publicaciones ni sus enlaces. La huella se calcula localmente y sólo se conserva su hash junto con el estado de ejecución en memoria de sesión.
- No incluye técnicas para ocultar la automatización o superar restricciones. **No se garantiza evitar bloqueos, verificaciones o sanciones de cuenta**, aunque se usen pausas.

Consulta las [condiciones de Facebook](https://www.facebook.com/legal/terms) y la [explicación de Meta sobre automatización y sus controles](https://about.fb.com/news/2021/04/how-we-combat-scraping/). Este proyecto no está afiliado a Meta y no presenta la automatización de una cuenta como expresamente autorizada por Meta.

## Desinstalar

En `chrome://extensions`, localiza **FB Unsave All** y pulsa **Quitar**. Esto elimina la extensión y su estado; no restaura guardados que ya se hayan quitado.

## Desarrollo y licencia

Consulta [DEVELOPMENT.md](docs/DEVELOPMENT.md) para conocer la estructura, las pruebas y las limitaciones de validación. Código distribuido bajo [licencia MIT](LICENSE).
