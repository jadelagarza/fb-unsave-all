# Cambios

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
