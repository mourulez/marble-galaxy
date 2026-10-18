  // Prueba de arranque: la página carga sin errores, sin peticiones externas, y se ve algo.
  //   python3 tools/probar.py tools/pruebas/arranque.js arranque
  //   python3 tools/probar.py tools/pruebas/arranque.js arranque --file    (como un doble clic)
  //
  // Para una prueba de un mecanismo, el patrón es el mismo, pero con el tiempo de la
  // simulación y estado del juego, p. ej.:
  //   prGuion([
  //     { dur: 0.5, inicio: () => { /* colocar la bola, fijar stick.x/y */ } },
  //     { dur: 2.0, cada: t => { /* medir */ }, fin: () => prLog('medida', { v: … }) },
  //   ], () => simT);
  prGuion([
    { dur: +prParam('espera', 3) },
    { dur: 0, inicio: () => prCaptura('arranque') },
    { dur: 0.5 },                                  // deja salir la captura antes de cerrar
  ], () => performance.now() / 1000);
