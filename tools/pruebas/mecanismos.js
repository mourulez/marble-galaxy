  // Pruebas funcionales de la bola con motor en el planetoide (ver "Verificación" en CLAUDE.md).
  // Cada escenario coloca la bola, fija la entrada (stick) y mide; el tiempo es el de la simulación.
  //   python3 tools/probar.py tools/pruebas/mecanismos.js gravedad llano aire
  //   python3 tools/probar.py tools/pruebas/mecanismos.js "cuesta:rampa=0&modo=parada" ...
  //   escenarios: gravedad, llano, aire, pivote, agujero, espacio, arriba, circulo, signos,
  //               cuesta (rampa=0|1|2, modo=parada|carrerilla|media|lanzada&v=…),
  //               patinar (en una copia con A_MOTOR muy por encima de MU·G, vía --pagina)
  const T = THREE, v3 = (x, y, z) => new T.Vector3(x, y, z);
  const pos = () => { const t = ballBody.translation(); return v3(t.x, t.y, t.z); };
  const vel = () => { const t = ballBody.linvel(); return v3(t.x, t.y, t.z); };
  const ang = () => { const t = ballBody.angvel(); return v3(t.x, t.y, t.z); };
  const r3 = x => +x.toFixed(3);
  const vec = p => [r3(p.x), r3(p.y), r3(p.z)];
  // stick fijado por la prueba: (sx, sy) en [-1, 1], arriba positivo; null = soltar
  const setStick = (sx, sy) => { stick = sx === null ? null : { id: -1, ax: 500, ay: 380, x: 500 + sx * 100, y: 380 - sy * 100, R: 100 }; };
  const tangent = (p, d) => d.clone().addScaledVector(p.clone().normalize(), -d.dot(p.clone().normalize())).normalize();
  const place = (p, v, head) => { placeBall(p, v); if (head) { snapHead.copy(tangent(p, head)); snapCam = true; } };
  const onGround = (lat, lon) => latLon(lat, lon, R_P + BALL_R + 0.002);
  // velocidad tangente y rodadura (ω·R frente a v, ambas en el plano tangente)
  const rolling = () => {
    const p = pos(), up = p.clone().normalize(), v = vel(), w = ang();
    const vt = v.clone().addScaledVector(up, -v.dot(up));
    const slipV = w.clone().cross(up.clone().multiplyScalar(BALL_R));   // velocidad que daría rodando sin patinar
    return { v: vt.length(), wR: slipV.length(), vt };
  };
  const ramp = ramps[prParam('rampa', 0)];
  // avance a y altura de la bola en las coordenadas de la rampa
  const rampCoords = p => {
    const d = p.clone().normalize();
    return { a: R_P * Math.atan2(d.dot(ramp.s), d.dot(ramp.f)), b: R_P * Math.atan2(d.dot(ramp.w), d.dot(ramp.f)), h: p.length() - R_P - BALL_R };
  };
  const esc = prEsc;
  let pasos = [];

  if (esc === 'gravedad') {
    // Soltada a 0,5 sobre la superficie en varios puntos: cae hacia el centro y se queda quieta
    const puntos = [['polo N', 90, 0], ['ecuador', 0, 150], ['polo S', -90, 0], ['abajo', -60, 100]];
    puntos.forEach(([nombre, lat, lon]) => {
      let p0;
      pasos.push({ dur: 2.0, inicio: () => { p0 = latLon(lat, lon, R_P + BALL_R + 0.5); place(p0); },
        fin: () => {
          const p = pos(), dirErr = Math.acos(clamp(p.clone().normalize().dot(p0.clone().normalize()), -1, 1)) / DEG;
          prLog('gravedad', { punto: nombre, r: r3(p.length()), rEsperado: r3(R_P + BALL_R), v: r3(vel().length()), desvioGrados: r3(dirErr),
                              apoyo: grounded, nUp: r3(nG.dot(upL)) });
        } });
    });
  }

  if (esc === 'llano') {
    // Desde parado en el polo, stick a tope hacia la longitud 160 (suelo libre). Luego se suelta.
    const head = v3(Math.cos(160 * DEG), 0, Math.sin(160 * DEG));
    let muestras = [], t0, pRel, dRel = 0;
    pasos = [
      { dur: 0.3, inicio: () => place(START.clone(), null, head) },
      { dur: 2.5, inicio: () => { setStick(0, 1); t0 = simT; muestras = []; },
        cada: () => { const r = rolling(); muestras.push([simT - t0, r.v, r.wR]); },
        fin: () => {
          // aceleración desde parado: pendiente de v en los primeros 0,06 s, descontando la curva del
          // motor (a = a0·(1 − v/V_MAX)) con la v media del tramo
          const ini = muestras.filter(m => m[0] <= 0.06 && m[0] > 0.005);
          const a0 = (ini[ini.length - 1][1] - ini[0][1]) / (ini[ini.length - 1][0] - ini[0][0])
            / (1 - (ini[0][1] + ini[ini.length - 1][1]) / 2 / V_MAX);
          const ult = muestras[muestras.length - 1];
          const ratios = muestras.filter(m => m[1] > 0.3).map(m => m[2] / m[1]);
          prLog('llano-motor', { a0: r3(a0), a0Esperada: r3(5 / 7 * A_MOTOR), vFinal: r3(ult[1]), vMax: V_MAX,
                                 wR_v_min: r3(Math.min(...ratios)), wR_v_max: r3(Math.max(...ratios)),
                                 v05: r3(muestras.find(m => m[0] >= 0.5)[1]), v1: r3(muestras.find(m => m[0] >= 1)[1]) });
        } },
      { dur: 3.5, inicio: () => { setStick(null); t0 = simT; muestras = []; pRel = pos(); dRel = 0; },
        cada: () => { const r = rolling(); const p = pos(); dRel += p.distanceTo(pRel); pRel = p; muestras.push([simT - t0, r.v, dRel]); },
        fin: () => {
          const v0 = muestras[0][1], m1 = muestras.find(m => m[0] >= 1.0);
          const parada = muestras.find(m => m[1] < 0.01);
          prLog('llano-soltar', { v0: r3(v0), decel01: r3((v0 - m1[1]) / m1[0]), decelEsperada: ROLL_RES,
                                  tParada: parada ? r3(parada[0]) : null, dParada: parada ? r3(parada[2]) : null,
                                  vFinal: r3(muestras[muestras.length - 1][1]) });
        } },
    ];
  }

  if (esc === 'patinar') {
    // Igual que 'llano', pero en una copia con A_MOTOR muy por encima de MU·G
    const head = v3(Math.cos(160 * DEG), 0, Math.sin(160 * DEG));
    let muestras = [];
    pasos = [
      { dur: 0.3, inicio: () => place(START.clone(), null, head) },
      { dur: 0.6, inicio: () => setStick(0, 1), cada: () => { const r = rolling(); muestras.push([r.v, r.wR]); },
        fin: () => {
          const m = muestras.filter(x => x[0] > 0.2);
          prLog('patinar', { A_MOTOR, MU, G, wR_v_medio: r3(m.reduce((s, x) => s + x[1] / x[0], 0) / m.length),
                             v: r3(muestras[muestras.length - 1][0]), wR: r3(muestras[muestras.length - 1][1]) });
        } },
    ];
  }

  if (esc === 'aire') {
    // Soltada a 1 u sobre el polo con 1 u/s en horizontal, dos veces: sin stick y con stick a la
    // derecha. La trayectoria debe ser la misma; el giro, distinto. Además, la inercia: con ω ≈ 0 el par
    // del motor da α = τ/I = 2,5·A_MOTOR/R si I = 2/5·m·R².
    const head = v3(Math.cos(160 * DEG), 0, Math.sin(160 * DEG));
    const p0 = latLon(90, 0, R_P + BALL_R + 1.0), v0 = head.clone();
    const res = {};
    ['sin', 'con'].forEach(modo => {
      let w0;
      const tray = [];
      pasos.push({ dur: 0.3, inicio: () => { setStick(null); place(START.clone(), null, head); } });
      pasos.push({ dur: 0.3, inicio: () => { place(p0.clone(), v0.clone()); if (modo === 'con') setStick(1, 0); },
        cada: t => {
          tray.push([t, pos()]);
          // con la curva del motor, ω(t) = ωmax·(1 − e^(−α0·t/ωmax)), ωmax = V_MAX/R: se despeja α0
          if (modo === 'con' && !w0 && t >= 0.02) { const wm = V_MAX / BALL_R; w0 = -wm / t * Math.log(1 - ang().length() / wm); }
        },
        fin: () => { res[modo] = { tray, w: ang() }; if (w0) res.alfa = w0; setStick(null); } });
    });
    // las dos trayectorias comparadas en el mismo tiempo de simulación (interpolando la de sin stick)
    const enT = (tray, t) => {
      for (let i = 1; i < tray.length; i++) if (tray[i][0] >= t) {
        const [ta, pa] = tray[i - 1], [tb, pb] = tray[i];
        return pa.clone().lerp(pb, (t - ta) / (tb - ta));
      }
      return null;
    };
    const difMax = () => Math.max(...res.con.tray.map(([t, p]) => { const q = enT(res.sin.tray, t); return q ? p.distanceTo(q) : 0; }));
    pasos.push({ dur: 0, inicio: () => prLog('aire', {
      difPosicion: r3(difMax()), wSin: r3(res.sin.w.length()), wCon: r3(res.con.w.length()),
      masa: r3(ballBody.mass()), alfaMedida: r3(res.alfa), alfaEsperada: r3(2.5 * A_MOTOR / BALL_R) }) });
  }

  if (esc === 'cuesta') {
    const modo = prParam('modo', 'parada');
    let maxH = -1, maxA = -9, a0;
    const medir = () => { const c = rampCoords(pos()); if (Math.abs(c.b) < RAMP_W / 2) { maxH = Math.max(maxH, c.h); maxA = Math.max(maxA, c.a); } return c; };
    if (modo === 'parada') {
      // Parada justo al norte del pie, stick a tope rampa arriba
      pasos = [
        { dur: 0.3, inicio: () => { const p = ramp.point(-0.16, 0, BALL_R + 0.002); place(p, null, ramp.s); } },
        { dur: 4, inicio: () => { prCaptura('rampa' + ramp.deg); setStick(0, 1); }, cada: medir },
      ];
    } else if (modo === 'carrerilla') {
      // Desde el polo (1,75 u de suelo libre hasta el pie), stick a tope hacia la rampa
      const head = v3(Math.cos(ramp.lon * DEG), 0, Math.sin(ramp.lon * DEG));
      let vPie = null;
      pasos = [
        { dur: 0.3, inicio: () => place(START.clone(), null, head) },
        { dur: 4, inicio: () => setStick(0, 1), cada: () => { const c = medir(); if (vPie === null && c.a >= 0) vPie = rolling().v; },
          fin: () => prLog('carrerilla', { vPie: r3(vPie) }) },
      ];
    } else if (modo === 'lanzada') {
      // Rodando a v (parámetro) hacia la rampa, 0,25 al norte del pie, con el stick a tope: umbral de subida
      const v = prParam('v', 1.7);
      pasos = [
        { dur: 0.3, inicio: () => { const p = ramp.point(-0.25, 0, BALL_R + 0.002); place(p, null, ramp.s); } },
        { dur: 3, inicio: () => {
            const p = ramp.point(-0.25, 0, BALL_R + 0.002), d = tangent(p, ramp.s);
            place(p, d.clone().multiplyScalar(v));
            ballBody.setAngvel(p.clone().normalize().cross(d).multiplyScalar(v / BALL_R), true);   // rodando
            setStick(0, 1);
          }, cada: medir },
      ];
      pasos.push({ dur: 0, inicio: () => prLog('lanzada', { v }) });
    } else {
      // A media rampa, en reposo y sin entrada: debe rodar hacia abajo
      pasos = [
        { dur: 1.5, inicio: () => { const s = ramp.surf(ramp.aTop / 2); place(s.p.addScaledVector(s.n, BALL_R + 0.002), null, ramp.s); a0 = rampCoords(pos()).a; },
          cada: medir },
      ];
    }
    pasos.push({ dur: 0, inicio: () => {
      const c = rampCoords(pos());
      prLog('cuesta', { deg: ramp.deg, modo, maxAltura: r3(maxH), alturaRepisa: RAMP_H, subio: maxH > RAMP_H - 0.02 && maxA > ramp.aTop,
                        maxA: r3(maxA), aTop: r3(ramp.aTop), a0: a0 !== undefined ? r3(a0) : null, aFinal: r3(c.a), hFinal: r3(c.h) });
    } });
  }

  if (esc === 'agujero') {
    // Coge la estrella de junto al agujero A, y con un empujón hacia el sur cae por él: colapso,
    // reaparición en el arranque con la cámara como al empezar y la estrella conservada.
    let cam0, starsAntes, tCaida = null;
    pasos = [
      // la referencia, tras unos frames (el primer tick() no coloca nada: clock.getDelta() da 0)
      { dur: 0.3, fin: () => { cam0 = { p: camera.position.clone(), q: camera.quaternion.clone() }; } },
      { dur: 0.3, inicio: () => place(onGround(STAR3_LAT, 60)) },
      { esperar: () => dying >= 0, inicio: () => { starsAntes = starsTaken; place(onGround(STAR3_LAT - 1, 60), southAt(STAR3_LAT - 1, 60).multiplyScalar(1.3)); },
        cada: () => { if (tCaida === null && pos().length() < R_P - 0.05) tCaida = simT; } },
      { esperar: () => dying < 0, inicio: () => prCaptura('colapso') },
      { dur: 0.2 },
      { dur: 0, inicio: () => {
        prCaptura('reaparicion');
        prLog('agujero', { estrellasAntes: starsAntes, estrellasDespues: starsTaken, pos: vec(pos()), enArranque: pos().distanceTo(START) < 0.01,
                           v: r3(vel().length()), camDifPos: r3(camera.position.distanceTo(cam0.p)), camDifAng: r3(camera.quaternion.angleTo(cam0.q) / DEG) });
      } },
      { dur: 0.5 },
    ];
  }

  if (esc === 'pivote') {
    // Quieta en el polo girando sobre la vertical a 10 rad/s, sin entrada: la resistencia al pivotar la
    // frena a SPIN_RES y se para en 10/SPIN_RES s, sin moverse del sitio
    let muestras = [];
    const wn = () => ang().dot(pos().normalize());
    pasos = [
      { dur: 0.3, inicio: () => place(START.clone()) },
      { dur: 1.5, inicio: () => { ballBody.setAngvel(v3(0, 10, 0), true); muestras = []; },
        cada: t => muestras.push([t, wn()]),
        fin: () => {
          const m = muestras.find(x => x[0] >= 0.2), parada = muestras.find(x => Math.abs(x[1]) < 0.05);
          prLog('pivote', { decel02: r3((muestras[0][1] - m[1]) / (m[0] - muestras[0][0])), decelEsperada: SPIN_RES,
                            tParada: parada ? r3(parada[0]) : null, tEsperado: r3(10 / SPIN_RES), wFinal: r3(wn()),
                            desplazamiento: r3(pos().distanceTo(START)) });
        } },
    ];
  }

  if (esc === 'espacio') {
    // Fuera de la influencia y sin gravedad: a los LOST_TIME s fuera de R_INF empieza el colapso
    let t0, tMuerte = null;
    pasos = [
      { dur: 0.3 },
      { esperar: () => dying >= 0, inicio: () => { place(latLon(90, 0, R_INF + 0.3), v3(0, 0.2, 0)); t0 = simT; },
        fin: () => { tMuerte = simT - t0; } },
      { esperar: () => dying < 0 },
      { dur: 0.2 },
      { dur: 0, inicio: () => prLog('espacio', { tFuera: r3(tMuerte), LOST_TIME, enArranque: pos().distanceTo(START) < 0.01 }) },
    ];
  }

  if (esc === 'arriba') {
    // Vuelta completa al planeta por el círculo máximo de longitudes 90/270, stick siempre arriba.
    // El arriba de la cámara sigue al local, y el rumbo no acumula giro: vuelve al inicial al pasar
    // de nuevo por el polo y se mantiene a lo largo de la marcha.
    const head = v3(0, 0, 1);
    let maxUp = 0, maxRumbo = 0, n = 0, sumUp = 0, vuelta = 0, prev = null, final = null;
    pasos = [
      { dur: 0.3, inicio: () => place(START.clone(), null, head) },
      { esperar: t => final !== null || t > 14, inicio: () => setStick(0, 1),
        cada: t => {
          const up = pos().normalize(), r = rolling();
          const aUp = Math.acos(clamp(camUp.dot(up), -1, 1)) / DEG;
          maxUp = Math.max(maxUp, aUp); sumUp += aUp; n++;
          if (t > 1 && r.v > 0.5) maxRumbo = Math.max(maxRumbo, Math.acos(clamp(tangent(pos(), camHead).dot(r.vt.normalize()), -1, 1)) / DEG);
          // ángulo recorrido alrededor del planeta en el plano yz
          const a = Math.atan2(up.z, up.y);
          if (prev !== null) { let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; vuelta += d; }
          prev = a;
          if (Math.abs(vuelta) >= 2 * Math.PI && final === null) final = { head: camHead.clone(), up: camUp.clone(), t };
          if (t > 1 && Math.abs(t % 2) < 0.02) prCaptura('vuelta_' + Math.round(t));
        },
        fin: () => prLog('arriba', { vueltaGrados: r3(vuelta / DEG), tVuelta: final && r3(final.t), maxDesfaseArriba: r3(maxUp), medioDesfaseArriba: r3(sumUp / n),
                                     maxDesvioRumboMarcha: r3(maxRumbo),
                                     rumboFinalVsInicial: final && r3(Math.acos(clamp(tangent(pos(), final.head).dot(tangent(pos(), head)), -1, 1)) / DEG) }) },
    ];
  }

  if (esc === 'circulo') {
    // Tres círculos pequeños cerca del polo girando el stick. El rumbo solo puede girar lo que da el
    // transporte paralelo en una esfera (el ángulo sólido encerrado), no una vuelta por círculo.
    const T_VUELTA = 2.5, VUELTAS = 3;
    let pts = [], h0, giroMarcha = 0, vPrev = null;
    // giro acumulado de la dirección de marcha alrededor del arriba local
    const marcha = () => {
      const r = rolling(); if (r.v < 0.2) return;
      const up = pos().normalize(), vd = r.vt.normalize();
      if (vPrev) { const vp = tangent(pos(), vPrev); giroMarcha += Math.atan2(up.dot(vp.clone().cross(vd)), vp.dot(vd)); }
      vPrev = vd;
    };
    pasos = [
      { dur: 0.5, inicio: () => place(START.clone(), null, v3(1, 0, 0)), fin: () => { h0 = camHead.clone(); } },
      { dur: T_VUELTA * VUELTAS, cada: t => { const a = 2 * Math.PI * t / T_VUELTA; setStick(Math.sin(a), Math.cos(a)); pts.push(pos().normalize()); marcha(); } },
      { dur: 1.5, inicio: () => setStick(null), cada: marcha },
      { dur: 0, inicio: () => {
        // ángulo sólido barrido (con signo), con vértice en el centro de la trayectoria
        const c = pts.reduce((s, p) => s.add(p), v3(0, 0, 0)).normalize();
        let om = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = c, b = pts[i - 1], d = pts[i];
          om += 2 * Math.atan2(a.dot(b.clone().cross(d)), 1 + a.dot(b) + b.dot(d) + d.dot(a));
        }
        // giro del rumbo alrededor del arriba, con signo
        const up = camUp, h1 = camHead, hp = tangent(pos(), h0);
        const giro = Math.atan2(up.dot(hp.clone().cross(h1)), hp.dot(h1));
        const rmax = Math.max(...pts.map(p => Math.acos(clamp(p.dot(c), -1, 1)) * R_P));
        prLog('circulo', { giroRumboGrados: r3(giro / DEG), giroMarchaGrados: r3(giroMarcha / DEG), anguloSolidoGrados: r3(om / DEG), radioTrayectoria: r3(rmax) });
      } },
    ];
  }

  if (esc === 'signos') {
    // s arriba aleja la bola de la cámara; s a la derecha la lleva a la derecha en pantalla. En el
    // polo norte, el ecuador y la cara de abajo, con la velocidad pasada a ejes de la cámara.
    const sitios = [['polo N', 90, 0, v3(1, 0, 0)], ['ecuador', 0, 150, v3(0, 0, 1)], ['abajo', -60, 100, v3(1, 0, 0)]];
    sitios.forEach(([nombre, lat, lon, head]) => {
      [[0, 1, 'arriba'], [1, 0, 'derecha']].forEach(([sx, sy, dir]) => {
        pasos.push({ dur: 0.4, inicio: () => { setStick(null); place(onGround(lat, lon), null, head); } });
        pasos.push({ dur: 0.35, inicio: () => setStick(sx, sy), fin: () => {
          const v = vel(), qi = camera.quaternion.clone().invert(), vc = v.clone().applyQuaternion(qi);
          // en pantalla: x a la derecha; alejarse = −z de la cámara (en profundidad)
          prLog('signos', { sitio: nombre, stick: dir, derechaPantalla: r3(vc.x), alejarse: r3(-vc.z), arribaPantalla: r3(vc.y),
                            ok: dir === 'arriba' ? -vc.z > 0.3 && Math.abs(vc.x) < 0.1 * -vc.z : vc.x > 0.3 && Math.abs(vc.z) < 0.1 * vc.x });
          setStick(null);
        } });
      });
    });
  }

  // Vigilante: si la simulación no avanza en 5 s de reloj (fuera del colapso), se cierra el escenario
  // para que salgan los errores recogidos
  let vigT = -1, vigReloj = performance.now();
  setInterval(() => {
    if (simT !== vigT || dying >= 0) { vigT = simT; vigReloj = performance.now(); return; }
    if (performance.now() - vigReloj > 5000) prFin({ atasco: true, simT, dying, pos: vec(pos()) });
  }, 500);
  prGuion(pasos, () => simT);
