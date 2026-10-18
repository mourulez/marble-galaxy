"""Prueba funcional del juego en Chrome headless.

Inyecta tools/preludio.js y un fichero de prueba justo antes de `const tick = () => {`
en una copia de index.html (`_prueba.html`, junto a él, que se borra al acabar), abre
un Chrome headless por escenario y recoge lo que la prueba registra.

Uso (desde la raíz del proyecto):
    python3 tools/probar.py tools/pruebas/arranque.js arranque
    python3 tools/probar.py tools/pruebas/mi_prueba.js esc1 "esc2:angulo=35&lado=1" --tiempo 90
    python3 tools/probar.py tools/pruebas/arranque.js arranque --file   (doble clic, sin servidor de página)

Cada escenario abre `_prueba.html?esc=<nombre>&run=<n>&<parámetros>`; la prueba los lee
con `prParam`. Resultados: líneas JSON en la consola y en tools/salida/log.jsonl;
capturas en tools/salida/<run>_<nombre>.png. Un escenario termina cuando la prueba
llama a `prFin()` o se agota el tiempo (--tiempo, segundos de reloj).

Escenarios en paralelo: hasta 3 va bien; más, y cada Chrome dibuja a pocos fps (la
física no cambia, pero las pruebas tardan más).
"""
import argparse, base64, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.parse
import http.server, pathlib

CHROME = r'C:/Program Files/Google/Chrome/Application/chrome.exe'
MARCA = '  const tick = () => {'
AQUI = pathlib.Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('prueba')
    ap.add_argument('escenarios', nargs='+')
    ap.add_argument('--pagina', default=str(AQUI.parent / 'index.html'))
    ap.add_argument('--tiempo', type=float, default=120)
    ap.add_argument('--file', action='store_true', help='abrir la página con file:// (como un doble clic)')
    a = ap.parse_args()

    pagina = pathlib.Path(a.pagina).resolve()
    html = pagina.read_text(encoding='utf-8')
    if html.count(MARCA) != 1:
        sys.exit(f'No encuentro una única línea "{MARCA.strip()}" en {pagina}')
    inyectar = (AQUI / 'preludio.js').read_text(encoding='utf-8') + '\n' + pathlib.Path(a.prueba).read_text(encoding='utf-8') + '\n'
    # Los errores de carga se recogen desde el principio, antes del código del juego
    # (con captura, también los de recursos que no cargan: esos no traen mensaje, sino el elemento)
    errores = ('<script>window.__errores=[];addEventListener("error",e=>__errores.push(e.message'
               ' ? e.message+" @"+(e.filename||"")+":"+(e.lineno||"")'
               ' : "no carga: "+((e.target&&(e.target.src||e.target.href))||"?")),true);</script>')
    copia = html.replace('<head>', '<head>' + errores, 1).replace(MARCA, inyectar + MARCA)
    temporal = pagina.parent / '_prueba.html'
    temporal.write_text(copia, encoding='utf-8')

    salida = AQUI / 'salida'
    salida.mkdir(exist_ok=True)
    cerrojo = threading.Lock()
    log = open(salida / 'log.jsonl', 'a', encoding='utf-8')
    fin = {}

    class Manejador(http.server.SimpleHTTPRequestHandler):
        def __init__(s, *x, **k): super().__init__(*x, directory=str(pagina.parent), **k)
        def log_message(s, *x): pass
        def end_headers(s):
            s.send_header('Access-Control-Allow-Origin', '*')   # para el modo --file (origen null)
            super().end_headers()
        def do_POST(s):
            cuerpo = s.rfile.read(int(s.headers['Content-Length']))
            q = urllib.parse.urlparse(s.path)
            if q.path == '/shot':
                p = urllib.parse.parse_qs(q.query)
                nombre = f"{p['run'][0]}_{p['n'][0]}.png"
                (salida / nombre).write_bytes(base64.b64decode(cuerpo.split(b',', 1)[1]))
            elif q.path == '/log':
                with cerrojo:
                    for e in json.loads(cuerpo):
                        log.write(json.dumps(e, ensure_ascii=False) + '\n')
                        print(json.dumps(e, ensure_ascii=False), flush=True)
                        if e.get('ev') == 'fin':
                            fin[e['run']] = e
                    log.flush()
            s.send_response(200); s.end_headers()

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Manejador)
    puerto = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    procesos = []
    for i, esc in enumerate(a.escenarios):
        nombre, _, params = esc.partition(':')
        run = f'{nombre}{i}'
        consulta = f'esc={urllib.parse.quote(nombre)}&run={run}&srv=http://127.0.0.1:{puerto}' + (f'&{params}' if params else '')
        url = (temporal.as_uri() if a.file else f'http://127.0.0.1:{puerto}/_prueba.html') + '?' + consulta
        datos = tempfile.mkdtemp(prefix='probar')
        # --host-resolver-rules: ningún nombre de host se resuelve salvo 127.0.0.1 (el servidor
        # de la prueba), así que una petición a internet falla en vez de salir, y prFin la
        # lista como externa
        p = subprocess.Popen([CHROME, '--headless=new', f'--user-data-dir={datos}', '--window-size=1000,750',
                              '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
                              '--disable-backgrounding-occluded-windows', '--no-first-run', '--mute-audio',
                              '--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
                              url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        procesos.append((run, p, datos))

    t0 = time.time()
    try:
        while time.time() - t0 < a.tiempo and len(fin) < len(procesos):
            time.sleep(0.5)
    finally:
        for run, p, datos in procesos:   # siempre por PID: por nombre cerraría el Chrome del usuario
            subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'], capture_output=True)
            shutil.rmtree(datos, ignore_errors=True)
        temporal.unlink(missing_ok=True)
        log.close()
    sin = [run for run, _, _ in procesos if run not in fin]
    print(f'Terminados {len(fin)}/{len(procesos)} en {time.time() - t0:.0f} s' + (f'; sin terminar: {", ".join(sin)}' if sin else ''))
    sys.exit(1 if sin else 0)


if __name__ == '__main__':
    main()
