# Cambios

## 0.1.1 — 14 de noviembre de 2026

- Corrige la lectura del contador cuando Facebook sólo muestra un número (por ejemplo, `16`) en lugar de «16 elementos seleccionados». La versión 0.1.0 se detenía antes de abrir la confirmación de eliminación.
- Limita la lectura del contador a la barra que reúne Todo, Desmarcar y Eliminar; ignora números, fechas y frases de las publicaciones guardadas.
- Añade pruebas con el formato numérico observado, números ajenos al contador y contadores ambiguos. Conserva la espera del indicador de carga antes de recargar.

## 0.1.0 — 14 de noviembre de 2026

- Primera implementación de la extensión local para limpiar guardados por lotes con recarga posterior al ciclo de carga.
