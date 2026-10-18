  // ===== PRELUDIO DE PRUEBA (lo inyecta tools/probar.py; no forma parte del juego) =====
  // Ayudas para la prueba, en el mismo ámbito que el código del juego (ve sus const y let):
  //   prParam(nombre, porDefecto)   parámetro del escenario (de la URL)
  //   prLog(evento, datos)          registra una línea (sale en la consola de probar.py)
  //   prCaptura(nombre)             PNG del canvas en tools/salida/<run>_<nombre>.png
  //   prGuion(pasos, reloj)         ejecuta pasos { dur, inicio(), cada(t), fin(), esperar() }
  //                                 midiendo el tiempo con reloj() (p. ej. () => simT)
  //   prFin(datos)                  cierra el escenario; añade errores y peticiones externas
  // Requiere que el juego llame `renderer`, `scene`, `camera` y `canvas` a esos objetos.
  const prQ = new URLSearchParams(location.search);
  const prSrv = prQ.get('srv') || '', prEsc = prQ.get('esc'), prRun = prQ.get('run');
  const prParam = (n, d) => prQ.has(n) ? (isNaN(+prQ.get(n)) ? prQ.get(n) : +prQ.get(n)) : d;
  const prCola = [];
  // Un lote que no llega vuelve a la cola: con varios Chrome en paralelo algún envío fallaba, y si era
  // el del 'fin', probar.py esperaba hasta agotar el tiempo con la prueba ya terminada
  const prEnviar = () => {
    if (!prCola.length) return;
    const lote = prCola.splice(0);
    fetch(prSrv + '/log', { method: 'POST', body: JSON.stringify(lote) })
      .then(r => { if (!r.ok) throw new Error(r.status); })
      .catch(() => prCola.unshift(...lote));
  };
  setInterval(prEnviar, 300);
  const prLog = (ev, datos) => prCola.push(Object.assign({ run: prRun, esc: prEsc, t: +(performance.now() / 1000).toFixed(2), ev }, datos || {}));
  const prCaptura = nombre => {
    renderer.render(scene, camera);
    fetch(prSrv + '/shot?run=' + prRun + '&n=' + encodeURIComponent(nombre), { method: 'POST', body: canvas.toDataURL('image/png') }).catch(() => {});
  };
  let prTerminado = false;
  const prFin = datos => {
    if (prTerminado) return; prTerminado = true;
    // todo lo que no sea el propio disco o el servidor local de la prueba es una petición externa
    const externas = performance.getEntriesByType('resource').map(r => r.name)
      .filter(u => !/^(file:|data:|blob:|http:\/\/127\.0\.0\.1[:/])/.test(u));
    prLog('fin', Object.assign({ errores: window.__errores || [], externas }, datos || {}));
    prEnviar();
  };
  const prGuion = (pasos, reloj) => {
    let k = -1, t0 = 0;
    const siguiente = () => { k++; t0 = reloj(); if (pasos[k] && pasos[k].inicio) pasos[k].inicio(); };
    const bucle = () => {
      try {
        if (k < 0) siguiente();
        if (k < pasos.length) {
          const p = pasos[k], t = reloj() - t0;
          if (p.cada) p.cada(t);
          if (p.esperar ? p.esperar(t) : t >= (p.dur || 0)) { if (p.fin) p.fin(); siguiente(); }
        }
        if (k >= pasos.length) { prFin(); return; }
      } catch (e) { prLog('error', { m: String(e && e.stack || e) }); prFin(); return; }
      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  };
  prLog('inicio', {});
