# Marble Galaxy — guía para Claude

## Idioma

**Se habla en español en Claude Code**: respuestas, preguntas, comentarios del código,
commits y documentos (specs incluidas). Los nombres de variables y funciones pueden ir
en inglés, como en el código heredado.

## Función de este fichero

Aquí va solo lo que **cruza todo el juego o no está en el código**: reglas
transversales, decisiones cerradas, cómo se verifica, cómo se trabaja y el entorno.
Se lee antes de tocar nada. El diseño de la fase en curso, si la hay, está en su
`spec-*.md`.

El detalle de cada pieza vive en los comentarios de `index.html`, junto al código, y
ahí se mantiene al día. Si una entrada solo afecta a una función, su sitio es un
comentario. Si algo de aquí deja de ser cierto, se borra. Tope orientativo: 80 líneas.

## Todo en local: nada online

- **El juego no hace ninguna petición externa.** Nada de CDN, Google Fonts, imágenes
  ni sonidos remotos.
- Las librerías están en `vendor/`, con la versión en el nombre y su licencia al lado:
  - `three-r128.min.js`;
  - `rapier3d-compat-0.21.0.cjs`.
  
  Cambiar de versión es sustituir el fichero y volver a verificar.
- Los gráficos se generan en código (canvas, geometría) o son ficheros del repo. La
  fuente es la del sistema.
- Se abre con **doble clic** (`file://`). Por eso no se usan módulos ES ni `fetch` de
  ficheros locales, que Chrome bloquea en `file://`.
  - Rapier va como script clásico, con `var exports = {};` justo antes, y
    `RAPIER = exports` (comprobado en Chrome desde disco).
  - Sus nombres minificados quedan en el ámbito global: **todo el código del juego va
    dentro de una IIFE**.

## Reglas transversales del código

- La física corre a paso fijo en `physicsStep()` (`STEP` = 1/120, máximo 8 por frame).
  `tick()` solo anima y dibuja.
- **Rapier acumula las fuerzas y pares** de un paso al siguiente: en cada paso se hace
  `resetForces`/`resetTorques` antes de añadir gravedad, motor y resistencia.
- La gravedad del mundo de Rapier es cero. Cada paso se aplica la de `gravityAt(p)`
  como fuerza. El "arriba" local es −dirección de la gravedad en ese punto, y todo lo
  orientado (cabeza, sombra, cámara, stick) se calcula con él, nunca con el `y` del
  mundo. Las pendientes también: una cuña plana de 20° en el planeta acaba en 39°.
- Con un cuerpo quieto, Rapier no rehace sus manifolds y `contactDist` se queda en el
  valor de antes de tocar: la separación se mide con el punto de contacto y la
  posición actual (ver `findSupport()`).
- Las juntas entre colisionadores distintos, siempre cóncavas: en las planas o
  convexas la bola choca con la arista (choques fantasma). Por eso el pie de las
  rampas va en lonchas convexas y su perfil arranca bajo la superficie.
- Toon con gradiente propio. Ningún color base en blanco puro: con la luz ambiente más
  el sol se satura y borra texturas. `ExtrudeGeometry` mete las dos tapas en un grupo
  de material; para texturizar solo la de arriba hay que separarlas.
- three r128 no tiene, por ejemplo, `CapsuleGeometry`.

## Decisiones cerradas

- El robot-bola es un diseño propio: no se reproducen personajes con copyright.
- Bola con motor (Marble Madness): el stick da un par y la bola avanza por rozamiento,
  con inercia; nada la frena salvo la resistencia a la rodadura y al pivotar. Gravedad
  hacia el centro del planetoide, de módulo constante (como en Galaxy, no 1/r²). En
  `galaxy` se descartó la gravedad al centro con un mundo que giraba el jugador; con
  una bola que se mueve sola, sí.
- Sombras de contacto (manchas bajo cada objeto), no sombras de la luz: con luz rasante
  se alargaban y el pase de sombras costaba un render extra.
- Caer es colapsar al agujero negro del centro: la física se para y la espiral es una
  animación. Se reaparece en el punto de arranque, en reposo y con la cámara colocada
  al instante. Las estrellas cogidas se conservan al morir.
- Cámara estilo Galaxy: la bola siempre en el centro, y no es una cámara de
  persecución (el rumbo no sigue a la marcha). Se descartaron la tercera persona y
  elegir "la mejor" vista por puntuación.

## Verificación

No hay tests ni build. Se valida ejecutando el juego real con `tools/probar.py` (uso y
ayudas en su cabecera y en `tools/preludio.js`):

- Inyecta la prueba (`tools/pruebas/*.js`) justo antes de `const tick = () => {` en
  una copia temporal de `index.html`. La prueba ve las variables del juego; este debe
  llamar `renderer`, `scene`, `camera` y `canvas` a esos objetos.
- Abre un Chrome headless por escenario, sin acceso a internet, y recoge medidas y
  capturas en `tools/salida/`.
- Al cerrar, cada escenario lista los errores y las peticiones externas.
- `--file` abre la página como un doble clic.
- `tools/pruebas/arranque.js` comprueba el arranque; vale para cualquier versión.
  `tools/pruebas/mecanismos.js` tiene un escenario por mecanismo (lista en su cabecera).
- El primer `tick()` no coloca nada (`clock.getDelta()` da 0): las referencias, como
  la cámara del arranque, se toman tras unos frames.
- **Pruebas funcionales, no de juego.** Los niveles los juega el usuario: no se hace un
  bot que los recorra ni se ajusta nada hasta que "salga". Se mide cada mecanismo en
  un escenario aislado: se coloca la bola, se fija la entrada (`stick.x/y`) y se
  comparan cifras con lo esperado (signos, aceleración, pendiente máxima, frenada…).
  Si hace falta geometría de prueba, va solo en la copia.
- **No es determinista**: `tick()` usa el reloj real (`THREE.Clock`). Un cambio que no
  debería alterar el juego se compara con la versión anterior en varias corridas.
- Comprobar siempre: que arranca con doble clic y sin red (`arranque.js` con `--file`),
  el colapso y la reaparición,
  y que la cámara reaparece igual que al empezar.

## Forma de trabajar

- Si el usuario pide entender o plantear, no se toca nada hasta que lo confirme. Sus
  propuestas se juzgan, no se aceptan por defecto.
- Fases dirigidas por una spec suelta en la raíz (`spec-*.md`). Historia lineal en
  `main`, sin ramas ni PRs.
- Commits en castellano: título con lo que cambia en el juego; cuerpo con el porqué,
  las cifras medidas y cómo se verificó.
- **"consolidar"** significa que la versión queda jugable online. Se hace de principio
  a fin y sin pedir confirmación:
  1. Borrar del todo la spec implementada (`spec-*.md` de la raíz). No moverla.
  2. Actualizar este `CLAUDE.md` con lo que deja la fase, si cumple el criterio de
     "Función de este fichero"; borrar lo obsoleto. Sin crónica de la fase.
  3. Commit en `main`, con `CLAUDE.md` incluido.
  4. `git push origin main`.
  5. Comprobar que GitHub Pages sirve la versión nueva
     (https://mourulez.github.io/marble-galaxy/, tarda 1-3 min; pedir la URL
     saltándose la caché).
- El repo es público (https://github.com/mourulez/marble-galaxy), y la web de Pages
  sirve todo lo que hay en la raíz, también este fichero y las specs.

## Entorno

- Windows, con Git Bash y PowerShell. No hay node; sí `python3`.
- Chrome en `C:/Program Files/Google/Chrome/Application/chrome.exe`. Headless se
  cierra por PID (`taskkill /PID <pid> /T /F`), nunca por nombre: cerraría también el
  Chrome del usuario.
- `C:/dev/galaxy` es el prototipo anterior (cannon, mundo que se inclina, robot con
  avance propio). De allí se copia código, pero no se modifica desde este proyecto:
  `.claude/settings.json` da acceso de lectura y deniega la edición.
