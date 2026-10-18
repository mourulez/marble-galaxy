# Bola con motor en un planetoide (Marble Madness × Mario Galaxy) — `index.html`

Primera fase del proyecto, de prueba de experiencia de usuario. Objetivo: probar el
diseño al que apunta el juego, una mezcla de **Marble Madness** (una bola con inercia:
las cuestas aceleran y frenan, parar es parte de la habilidad) y **Mario Galaxy**
(planetoides pequeños con gravedad propia y cámara que encuadra). Se hace con Rapier y
un único planetoide de prueba. Nace del prototipo `C:/dev/galaxy` (`index.html`, que
inclina el mundo, e `index2.html`, el robot con avance propio). Se borra al
consolidar; lo que quede de regla pasa a `CLAUDE.md`.

## Por qué

- En `galaxy/index2.html` el robot es una fuerza "de juego" aplicada en su centro, con
  velocidad objetivo y freno: responde bien, pero no es una bola. Marble Madness pide
  lo contrario: **control por aceleración, inercia y física de rodadura de verdad**.
- La física de una bola con un motor dentro depende del rozamiento, y cannon 0.6.2 lo
  limita a μ·m·|g| por contacto sin mirar la fuerza normal (de ahí el material de
  pared aparte y la gravedad obligada en `world.gravity`). Rapier usa Coulomb con la
  normal real. Además tiene CCD, consultas de contactos y rayos, y es determinista.
- Mario Galaxy pide **gravedad hacia el centro del planetoide**. `CLAUDE.md` lo da por
  descartado, pero se probó con el modelo en que el jugador giraba el mundo. Con una
  bola que se mueve sola la situación es otra: esta fase **reabre esa decisión**.

## Fichero

- `index.html` de este proyecto, nuevo e independiente. No carga nada de
  `C:/dev/galaxy`: de allí solo se copia código. Ese proyecto no se toca (comprobar al
  acabar los hashes de su `index.html` e `index2.html`).
- Se traen de `galaxy`, copiados y adaptados, solo estos elementos:
  - el renderer, el gradiente toon y la regla de color (ningún color base en blanco puro);
  - el robot: la textura del cuerpo y la cabeza flotante;
  - las estrellas coleccionables y su contador;
  - el agujero negro (esfera negra y disco de acreción con su shader) y la animación de colapso;
  - el fondo de estrellas en tres capas, con parallax solo por la cámara;
  - las sombras de contacto;
  - el botón de pantalla completa y los textos;
  - el stick flotante de `galaxy/index2.html`: aro indicador, teclado, dos dedos y rueda
    para zoom.
- No se trae: cannon, escalones, `LEVELS`, engranaje, portal, zona de pruebas de
  cuestas, giro e inclinación del mundo, zonas por plataforma ni la cámara por
  `progL`.

## Librerías

Todo local, en `vendor/` (ver `CLAUDE.md`):

- `three-r128.min.js`: three r128 (global `THREE`), el de `galaxy`.
- `rapier3d-compat-0.21.0.cjs`: Rapier 3D 0.21.0 en su versión `compat`, con el WASM
  dentro del JS (unos 4,3 MB).
  - Se carga como script clásico, con `var exports = {};` justo antes; después,
    `RAPIER = exports`. Así funciona con doble clic (`file://`), donde Chrome bloquea los
    módulos. Comprobado: arranca desde disco en unos 0,3 s.
  - Se inicializa de forma asíncrona (`RAPIER.init()`), y hasta que está listo se
    muestra "Cargando…".

## Física

- **Paso fijo** como hasta ahora: `world.timestep` = `STEP` = 1/120, máximo 8 pasos
  por frame. `tick()` solo anima y dibuja.
- **Gravedad**: la del mundo de Rapier queda a cero. En cada paso se aplica a la bola
  una fuerza `m · gravityAt(p)`, con `resetForces` antes de añadirla. `gravityAt(p)`
  apunta al centro del planetoide con módulo constante `G` (como en Galaxy, no 1/r²)
  dentro del radio de influencia `R_INF`; fuera de él vale cero. Con Rapier no hace
  falta el truco de cannon: el rozamiento sale de la normal real.
- **"Arriba" local** = −dirección de la gravedad en la bola. Lo usan el motor, la
  cabeza, la sombra y la cámara.
- **La bola** es un cuerpo dinámico, con CCD activado, rozamiento `MU` y una
  restitución pequeña (`BOUNCE`). Sin amortiguación lineal y con la angular mínima.

## El robot: bola con un motor dentro

El stick no fija una velocidad: **hace girar la bola**. El motor aplica un **par**
(`addTorque`) y la bola avanza solo por rozamiento con el suelo, como una bola de
hámster.

- **Eje del par**: `n × u`. Aquí `u` es la dirección del stick en el plano tangente y
  `n` es la normal del apoyo si hay contacto, o el arriba local si no lo hay. En una
  rampa, la bola rueda a lo largo de ella.
- **Fuerza del motor** (bola maciza, `I = 2/5·m·R²`, que es la que crea Rapier):

  ```
  eje  = normalize(n × u)
  ω_eje = ω · eje                      (giro actual a favor del motor)
  τ    = |s| · A_MOTOR · m · R · clamp(1 − ω_eje · R / V_MAX, 0, 1)
  par  = τ · eje
  ```

  - `A_MOTOR` está en u/s².
  - El último factor es la curva del motor: el par baja hasta cero cuando la bola gira
    a `V_MAX / R` a favor del motor. Así hay velocidad punta en llano. **Cuesta abajo
    la gravedad puede pasarla**: es Marble.
  - Si la bola gira en contra (stick hacia atrás para frenar), el factor se queda en 1:
    par entero.
- **Consecuencias físicas**, que son el objetivo y no se corrigen:
  - En llano acelera a `5/7 · A_MOTOR`.
  - Sube cuestas hasta el menor de dos límites: el del motor, `asin(A_MOTOR / G)`, y el
    del agarre, `atan(MU)`. Con los valores iniciales queda en unos 42°. Más
    empinadas solo se suben con impulso.
  - Si el par supera lo que permite el agarre, la bola **patina**: gira más de lo que
    avanza.
  - **En el aire** el motor solo hace girar la bola: no hay control aéreo, pero el
    giro se nota al caer.
  - **Al soltar**, nada la frena salvo la resistencia a la rodadura: conserva la
    inercia y en una cuesta rueda hacia abajo.
  - **Frenar** es empujar el stick hacia el otro lado.
- **Resistencia a la rodadura**: Rapier no la tiene. Solo mientras hay contacto con un
  apoyo de normal `n`, se aplica un par contra la parte de rodadura del giro:

  ```
  ω_t = ω − n·(ω · n)                  (el giro sobre la normal no es rodar)
  dec = min(ROLL_RES, |ω_t| · R / STEP) (no invierte el giro en un paso)
  par = −(7/5) · m · R · dec · ω_t / |ω_t|
  ```

  - Con el factor 7/5, la bola rodando decelera exactamente `dec`.
  - Es lo que la para en llano.
  - La sostiene quieta en cuestas de hasta `asin(7/5 · ROLL_RES / G)` (≈7°).
- **Resistencia al pivotar**: Rapier tampoco la tiene (el contacto es un punto, que al
  girar sobre la normal no resbala), y la de rodadura no toca ese giro: la bola se
  quedaba quieta girando como una peonza (medido: 11 rad/s, y 10,5 a los 8 s). Siempre
  que hay apoyo, con o sin entrada:

  ```
  ω_n = ω · n
  dec = min(SPIN_RES, |ω_n| / STEP)
  par = −(2/5) · m · R² · dec · sign(ω_n) · n
  ```

  - Frena ese giro a `SPIN_RES` sin invertirlo en un paso.
  - No toca la rodadura: no cambia ninguna cifra del motor.
- **El apoyo** se lee con `world.contactPairsWith` y `world.contactPair` (normal del
  manifold, con cuidado de su sentido), contando como apoyo el contacto con la normal
  a menos de 60° del arriba local.

## El planetoide

- **Esfera** de radio `R_P`. Su malla es también su colisionador: un `trimesh` fino,
  con suficientes divisiones para que la bola ruede suave y con el flag
  `TriMeshFlags.FIX_INTERNAL_EDGES` (existe en 0.21.0, comprobado), para que no tropiece
  en las aristas entre triángulos. La superficie es procedural (en el shader, sin
  costuras) y de bordes nítidos, estilo toon: sobre todo hierba en dos tonos, con un borde
  oscuro donde acaba, y roca en piedras con grietas (Voronoi), en manchas y siempre
  alrededor de los agujeros.
- **Agujeros**: siete, de contorno irregular (no círculos), recortados de la malla. Cada
  uno tiene un radio medio y su contorno varía ±`HOLE_WOBBLE` con el acimut.
  - De su contorno baja una pared hasta `HOLE_DEPTH` (colisionador y malla), que da
    grosor a la corteza.
  - El planeta es hueco: el que cae por un agujero cae hacia el centro por la propia
    gravedad.
- **El agujero negro**, en el centro, con el diseño de `galaxy/index.html` a escala. Desde
  fuera solo se ve su brillo a través de los agujeros.
- **Rampas**: tres cuñas pegadas a la superficie, con la base algo hundida para que no
  quede escalón con la curvatura. Rapier las colisiona como `convexHull`. Cada una
  sube a una repisa a `RAMP_H` de altura:
  - 20°: se sube sin más;
  - 35°: se sube despacio;
  - 50°: por encima del límite del motor, solo se sube cogiendo carrerilla.
- **Estrellas**: tres, en la repisa de 35°, en la de 50° y junto al borde de un
  agujero. El contador se conserva al morir. Al cogerlas todas aparece "¡Completo!" y
  vuelven a salir.
- **Arranque y reaparición**: en el "polo norte", en reposo.

### Disposición

- El planetoide está centrado en el origen y su polo norte es `+y`.
- Las posiciones van en latitud y longitud, con la longitud 0° en `+x` y la 90° en `+z`.
- Las rampas **suben hacia el sur**: el pie queda en el lado norte y la repisa (de
  0,5 de fondo) más al sur. Todas miden 0,6 de ancho.
- Entre el polo y el pie de cada rampa hay 1,75 u de suelo libre. Sobra carrerilla
  para la de 50°: hay que entrar a más de ≈1,7 u/s, y esa velocidad se alcanza en
  ≈0,73 u.

| Elemento | Latitud | Longitud | Nota |
|---|---|---|---|
| Arranque | 90° N | — | La cámara empieza mirando hacia la longitud 0°: de frente, la rampa de 20° |
| Rampa de 20° | pie a 50° N | 0° | |
| Rampa de 35° | pie a 50° N | 120° | Estrella en la repisa |
| Rampa de 50° | pie a 50° N | 240° | Estrella en la repisa |
| Agujero A | 0° | 60° | Entre las rampas de 20° y 35°; radio medio `HOLE_R` |
| Agujero B | 40° S | 200° | En la cara de abajo; radio medio `HOLE_R` |
| Agujeros C–G | (5° N, 195°), (0°, 300°), (15° S, 240°), (35° S, 125°), (65° S, 10°) | | Radios medios 0,5, 0,55, 0,5, 0,45 y 0,5 |
| Tercera estrella | ≈23° N | 60° | Al norte del agujero A, a 0,35 u de su borde (la latitud sale de su contorno) |

Lo que hay entre elementos es suelo libre. Entre el borde de un agujero y una rampa
quedan al menos 1,26 u, entre dos agujeros 0,43 u y del arranque al agujero más cercano
3,08 u (con el contorno en su máximo); la tercera estrella está cerca del agujero A a
propósito. Los agujeros evitan también los recorridos de las pruebas (meridiano 160°,
círculo máximo de 90°/270°, puntos de gravedad y signos).

## Caer y morir

- Caer al centro: cuando la bola baja de `R_KILL` empieza el colapso (física parada,
  espiral animada hacia el agujero negro, como en `galaxy/index.html`). `R_KILL` es el
  fondo de las paredes de los agujeros: con 0,9, la bola que entraba de lado orbitaba
  alrededor del centro sin bajar de ese radio y cruzaba el planeta por dentro.
- Perderse en el espacio, por salir disparada de una rampa fuera de la influencia:
  más de `LOST_TIME` fuera de `R_INF`, o más lejos que `R_SPACE`.
- Al reaparecer: bola en el arranque y en reposo, sin gesto en curso, cámara colocada
  al instante como al empezar. Se conservan las estrellas.

## Cámara estilo Galaxy

- **La bola siempre en el centro**, vista desde arriba y algo por detrás, a distancia
  `CAM_DIST` y elevación `CAM_ELEV`. Con esa elevación se ve la curvatura y los
  agujeros cercanos.
- **El arriba de la cámara sigue al arriba local** suavizado: rodar alrededor del
  planeta hace girar el mundo en pantalla, no el horizonte.
- **El rumbo no gira solo**: se transporta en paralelo. En cada frame se le aplica el
  giro mínimo que lleva el arriba anterior al nuevo, así la cámara no da vueltas al
  pasar por los polos ni al rodar en círculo.
- **Durante el colapso** sigue la caída por el agujero y se queda quieta al empezar la
  espiral.
- **Zoom** con dos dedos y con la rueda, como en `galaxy/index2.html`.
- **Ejes del stick**: los horizontales de la cámara **en vivo**, proyectados al plano
  tangente de la bola. En `galaxy/index2.html` se fijaban al apoyar el dedo porque la cámara
  saltaba de zona; aquí la cámara solo se transporta suavemente, y si los ejes quedaran
  fijos el mapeo se torcería al dar la vuelta al planeta.

## Resto

- **Cabeza** flotando sobre la bola según el arriba local. Mira hacia donde apunta el
  stick y, sin entrada, hacia donde rueda.
- **Sombra**: un rayo (`castRayAndGetNormal`) en el sentido de la gravedad. La mancha
  se coloca en el punto de impacto, orientada a su normal.
- **Texto de ayuda**: "Arrastra para rodar".

## Parámetros iniciales

Constantes con nombre, juntas, para ajustarlas jugando:

| Parámetro | Valor | Nota |
|---|---|---|
| `G` | 12 u/s² | Como hasta ahora |
| `BALL_R` | 0,12 | El robot de siempre |
| `R_P` | 2,5 | Vuelta completa ≈ 16 u, unas 65 bolas |
| `R_INF` | 2·`R_P` | Radio de influencia de la gravedad |
| `MU` (bola–superficie) | 1,0 | Agarre: limita a ≈45° |
| `BOUNCE` | 0,1 | |
| `A_MOTOR` | 8 u/s² | En llano acelera a ≈5,7; el motor sostiene hasta ≈42° |
| `V_MAX` | 2,0 u/s | Velocidad punta del motor en llano; cuesta abajo se puede pasar |
| `ROLL_RES` | 1,0 u/s² | Desde `V_MAX`, para en ≈2 s y ≈2 u; sostiene ≈7° |
| `SPIN_RES` | 20 rad/s² | Un giro sobre la normal de 10 rad/s se para en 0,5 s |
| `HOLE_R` | 0,65 | Radio medio de A y B. Antes 0,3; se agrandó para que se vea el agujero negro, como en Galaxy |
| `HOLE_WOBBLE`, `HOLE_DEPTH` | 0,25, 0,4 | Variación del contorno; grosor de la corteza |
| `RAMP_H` | 0,3 | A 50°, parada al pie no sube (patina). Lanzada a `V_MAX` llega a ≈0,49 u de rampa (la curva del motor ya casi no empuja) y le hacen falta 0,39: entrando a menos de ≈1,7 u/s no sube |
| `R_KILL` | `R_P − HOLE_DEPTH` (2,1) | Empieza el colapso al pasar el fondo de la pared de un agujero |
| `LOST_TIME`, `R_SPACE` | 3 s, 3·`R_P` | |
| `CAM_DIST`, `CAM_ELEV` | 5, 50° | |
| Stick (radio, zona muerta, curva) | como en `galaxy/index2.html` | |

## Verificación

Pruebas funcionales en escenarios aislados (ver "Verificación" en `CLAUDE.md`): se
coloca la bola, se fija `s` y se miden cifras. No se juega el planetoide entero; eso
lo hace el usuario.

- La página arranca con doble clic (`file://`) y sin red, sin errores en consola, y no
  hace ninguna petición externa.
- **Gravedad**: soltada en varios puntos (polos, ecuador, cara de abajo), la bola cae
  hacia el centro y se queda quieta en la superficie.
- **Motor en llano**:
  - desde parado y con el stick a tope, la aceleración es ≈`5/7·A_MOTOR` (±10 %);
  - la velocidad punta es ≈`V_MAX`;
  - rueda sin patinar (`ω·R ≈ v`, ±10 %).
- **Patinar**: con `A_MOTOR` muy por encima de `MU·G`, `ω·R` supera claramente a `v`.
  Solo comprueba que la física es la esperada; no se queda así.
- **Al soltar**: decelera ≈`ROLL_RES` y se para. Sin freno automático.
- **Pivotar**: quieta y girando sobre la normal, frena a ≈`SPIN_RES` y se para sin
  moverse del sitio.
- **Cuestas**, en las tres rampas:
  - desde parada al pie, sube la de 20° y la de 35° y no la de 50°;
  - con carrerilla sube la de 50°;
  - colocada a media rampa y sin entrada, rueda hacia abajo en las tres.
- **En el aire**, el stick cambia el giro de la bola pero no su trayectoria.
- **Agujero**: soltada junto al borde con un pequeño empujón, cae por él hasta el
  centro, colapsa y reaparece en el arranque, con la cámara como al empezar y las
  estrellas conservadas.
- **Cámara**:
  - su arriba sigue al arriba local;
  - al rodar en círculo alrededor del planeta, el rumbo no acumula giro;
  - signos: `s` hacia arriba aleja la bola de la cámara y hacia la derecha la lleva a
    la derecha en pantalla. Comprobarlo en el polo norte, en el ecuador y en la cara de
    abajo.
- `C:/dev/galaxy` queda idéntico.

## Al consolidar

Se decide si este modelo (bola con motor, gravedad hacia el centro, Rapier) es el del
juego. Lo que quede pasa a `CLAUDE.md`: la gravedad hacia el centro, a decisión
cerrada, y los parámetros que se hayan asentado jugando, a comentarios del código.

## Fuera de esta fase

Salto, varios planetoides y el paso entre ellos (estrellas lanzadera), plataformas
móviles en el planetoide, enemigos, cronómetro, giroscopio, rendimiento en móviles
modestos y diseño de niveles completos.
