// Teléfono de la maestra. Todo lo que se toca aquí se valida otra vez en el
// servidor: si alguien abre esta página sin el PIN, los botones no hacen nada.
import { connect, post, esc, mount, $, $$, setText, secondsLeft, ringStyle, everyTick } from '/bus.js';

const app = $('#app');
let st = null;

const TITULOS = {
  topic: ['Paso 1 de 3', 'Las preguntas'],
  crear: ['Paso 1 de 3', 'Nuevo cuestionario'],
  lobby: ['Paso 2 de 3', 'Alumnos listos'],
  question: ['En juego', 'Respuestas en vivo'],
  reveal: ['En juego', 'Resultado de la pregunta'],
  stats: ['Juego terminado', 'Resumen del grupo'],
};

const PRINCIPAL = {
  topic: 'Continuar', crear: 'Siguiente', lobby: 'Comenzar el juego',
  question: 'Terminar la pregunta', stats: 'Nuevo juego',
};

// ================= puerta del PIN =================

function pantallaPin({ crear, error, bloqueo }) {
  app.className = 'stu';
  app.innerHTML =
    '<main id="root"><div class="center left stepIn" style="padding:0 20px">' +
      '<div class="logo">P</div>' +
      '<div><h1 class="big">' + (crear ? 'Creá tu PIN' : 'Hola, maestra') + '</h1>' +
      '<p class="lead" style="max-width:none">' +
        (crear
          ? 'Elegí 6 números que sólo sepas vos. Con eso entrás a tu panel; los alumnos nunca lo ven.'
          : 'Escribí tu PIN para abrir el panel. Este teléfono queda recordado.') +
      '</p></div>' +
      '<input class="field code" id="pin" type="password" inputmode="numeric" maxlength="6" ' +
        'autocomplete="' + (crear ? 'new-password' : 'current-password') + '" placeholder="······" aria-label="PIN">' +
      (crear ? '<input class="field code" id="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Repetilo" aria-label="Repetir PIN">' : '') +
      (error ? '<div class="alert bad"><h3>' + esc(error) + '</h3></div>' : '') +
      '<button class="btn primary" id="go" disabled>' + (crear ? 'Guardar mi PIN' : 'Entrar') + '</button>' +
      (bloqueo ? '<p class="lead" style="max-width:none">Esperá ' + bloqueo + ' segundos antes de volver a intentar.</p>' : '') +
    '</div></main>';

  const pin = $('#pin');
  const pin2 = $('#pin2');
  const go = $('#go');
  const ok = () => /^\d{6}$/.test(pin.value) && (!crear || pin.value === pin2.value);
  const check = () => { go.disabled = !ok(); };
  pin.addEventListener('input', check);
  if (pin2) pin2.addEventListener('input', check);
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ok()) go.click(); });

  go.addEventListener('click', async () => {
    go.disabled = true;
    const r = await post(crear ? '/api/auth/crear' : '/api/auth/entrar', { pin: pin.value });
    if (r.ok) return arrancar();
    const d = r.data || {};
    if (d.error === 'bloqueado') return pantallaPin({ crear, error: 'Demasiados intentos.', bloqueo: d.segundos });
    if (d.error === 'formato') return pantallaPin({ crear, error: 'El PIN son 6 números.' });
    if (d.error === 'ya-existe') return pantallaPin({ crear: false, error: 'Ya hay un PIN en este Pilas.' });
    pantallaPin({ crear, error: 'Ese PIN no es. ' + (d.segundos ? 'Cuidado: se bloquea a los 5 intentos.' : 'Probá de nuevo.') });
  });
  pin.focus();
}

// ================= piezas =================

function seats(s, conMarca) {
  if (!s.seats.length) {
    return '<div class="note">Todavía no ha entrado nadie. El código QR está en la pantalla del aula.</div>';
  }
  const celdas = s.seats.map((p) => {
    const num = String(p.seat).padStart(2, '0');
    let cls = 'seat';
    let big = num;
    let small = esc(p.name);
    if (!p.online) { cls += ' off'; if (conMarca) { big = '–'; small = num; } else small = 'sin señal'; }
    else if (conMarca && s.q && s.q.open) { cls += p.mark ? ' ok' : ' idle'; big = p.mark ? '✓' : '·'; small = num; }
    else if (conMarca) { cls += p.mark ? ' ' + p.mark : ' idle'; big = p.mark || '·'; small = num; }
    return '<div class="' + cls + '"><b>' + esc(big) + '</b><span>' + small + '</span></div>';
  }).join('');
  return '<div class="seats">' + celdas + '</div>';
}

function bars(s) {
  const total = s.answered || 0;
  const opts = (s.q && s.q.opts) || {};
  const filas = Object.entries(opts).map(([k, v]) => {
    const n = (s.tallies || {})[k] || 0;
    const pct = total ? Math.round((n / total) * 100) : 0;
    return '<div class="bar"><div class="k ' + k + '">' + k + '</div>' +
      '<div class="t">' + esc(v) + '</div>' +
      '<div class="track"><div class="fill ' + k + '" style="width:' + pct + '%"></div></div>' +
      '<div class="n">' + n + '</div></div>';
  }).join('');
  return '<div class="bars">' + filas + '</div>';
}

// Lo que los alumnos escriben en una pregunta abierta. El texto lo teclea un
// niño: siempre escapado, y nunca dentro de un atributo.
function escritas(s) {
  const filas = (s.texts || []).map((t) =>
    '<div class="escrita"><b>' + String(t.seat).padStart(2, '0') + '</b>' +
    '<div><span>' + esc(t.name) + '</span><p>' + esc(t.text) + '</p></div></div>').join('');
  return '<div class="escritas">' +
    (filas || '<div class="note">Todavía nadie escribió su respuesta.</div>') + '</div>';
}

// ================= pasos del asistente =================

function pasoTema(s) {
  const cargado = s.topic
    ? '<div class="note"><div style="font-size:13px;color:var(--muted-2);font-weight:600;letter-spacing:.3px">CUESTIONARIO CARGADO</div>' +
      '<div style="font-size:20px;font-weight:600;margin-top:2px">' + esc(s.topicLabel) + '</div>' +
      '<div style="font-size:15px;color:var(--muted)">' + s.total + ' preguntas · se juegan todas, en orden</div></div>'
    : '';
  return '<div class="stack stepIn">' +
    '<h1 class="h1">¿Con qué preguntas<br>jugamos hoy?</h1>' +
    '<button class="btn soft" id="crear" style="height:72px;font-size:18px">Crear mi cuestionario</button>' +
    '<button class="btn soft" id="subir" style="height:72px;font-size:18px">Subir plantilla CSV</button>' +
    '<input type="file" id="archivo" accept=".csv,text/csv" hidden>' +
    '<div id="impRes"></div>' + cargado +
    '<div class="note" style="font-size:15px;color:var(--muted-2)">' +
      '<a href="/api/host/plantilla.csv">Bajá la plantilla</a>: número, segundos, pregunta, respuesta correcta y hasta tres más. ' +
      'Las cuatro respuestas vacías = pregunta abierta. El nombre del archivo es el nombre del cuestionario.</div>' +
  '</div>';
}

// Asistente "crear mi cuestionario": primero nombre y cantidad, después una
// pantalla por pregunta. Vive sólo en el navegador hasta que se guarda.
let borrador = null;   // { tema, n, i, preguntas: [{ seconds, text, answers }] }  · i = -1 es la pantalla de cantidad

function pasoCrearCantidad() {
  return '<div class="stack stepIn">' +
    '<h1 class="h1">¿Cómo se llama y<br>cuántas preguntas tiene?</h1>' +
    '<input class="field" id="tema" maxlength="40" placeholder="Nombre del cuestionario" aria-label="Nombre del cuestionario" value="' + esc(borrador.tema) + '">' +
    '<label class="note" style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<span style="font-size:17px">Cantidad de preguntas</span>' +
      '<input class="field" id="cantidad" type="number" inputmode="numeric" min="1" max="50" value="' + borrador.n + '" style="width:110px;text-align:center">' +
    '</label>' +
    '<p style="font-size:15px;color:var(--muted-2);line-height:1.5;margin:0">Después escribís cada pregunta con sus respuestas y cuántos segundos dura.</p>' +
  '</div>';
}

function pasoCrearPregunta() {
  const q = borrador.preguntas[borrador.i] || { seconds: 20, text: '', answers: ['', '', '', ''] };
  const resp = (k, ph, extra) =>
    '<input class="field resp" maxlength="120" placeholder="' + ph + '" aria-label="' + ph + '" value="' + esc(q.answers[k] || '') + '"' + (extra || '') + '>';
  return '<div class="stack stepIn">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<h1 class="h1" style="margin:0">Pregunta ' + (borrador.i + 1) + ' de ' + borrador.n + '</h1>' +
      '<label title="Segundos para responder" style="display:flex;align-items:center;gap:4px;background:var(--chip);border-radius:22px;padding:8px 14px;color:var(--brand);font-weight:600;font-size:18px">' +
        '<span aria-hidden="true">⏱</span>' +
        '<input id="segundos" type="number" inputmode="numeric" min="5" max="300" value="' + q.seconds + '" aria-label="Segundos para responder" ' +
          'style="width:58px;border:0;background:transparent;font:inherit;color:inherit;text-align:center;outline:none">' +
        '<span>s</span></label>' +
    '</div>' +
    '<textarea class="field libre" id="texto" rows="3" maxlength="300" placeholder="Escribí la pregunta" aria-label="Pregunta">' + esc(q.text) + '</textarea>' +
    resp(0, 'Respuesta correcta', ' style="border-color:var(--ok)"') +
    resp(1, 'Otra respuesta') + resp(2, 'Otra respuesta') + resp(3, 'Otra respuesta') +
    '<div class="note" style="font-size:14px;color:var(--muted-2)">Dejá las cuatro respuestas vacías para que los alumnos escriban la suya.</div>' +
    '<div id="impRes"></div>' +
  '</div>';
}

function leerPregunta() {
  borrador.preguntas[borrador.i] = {
    seconds: Number($('#segundos').value) || 20,
    text: $('#texto').value,
    answers: $$('.resp').map((i) => i.value),
  };
}

function pasoSala(s) {
  const desconectados = s.joined - s.connected;
  return '<div class="stack stepIn">' +
    '<div class="codebox"><div>' +
      '<div class="lbl">CÓDIGO DE SALA</div><div class="code">' + esc(s.code) + '</div></div>' +
      '<div class="rt"><b id="conn">' + s.connected + '</b>' +
      '<div style="font-size:14px;opacity:.82">de ' + s.joined + ' listos</div></div></div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<div class="h2">Alumnos conectados</div>' +
      '<div style="font-size:14px;color:var(--muted-2)">Responden A–D</div></div>' +
    seats(s, false) +
    (desconectados > 0
      ? '<div class="alert bad"><h3>' + desconectados + ' sin señal</h3>' +
        '<p style="margin:0;font-size:15px;line-height:1.45">Puede empezar igual: se suman al reconectarse.</p></div>'
      : '') +
    (s.joined === 0
      ? '<div class="alert warn"><h3>Todavía no entró nadie</h3>' +
        '<p>En la pantalla del aula está el código QR. Que lo escaneen con la cámara.</p></div>'
      : '') +
  '</div>';
}

function pasoPregunta(s) {
  return '<div class="stack stepIn" style="gap:14px">' +
    '<div style="display:flex;align-items:center;gap:14px">' +
      '<div class="ring" id="ring" style="width:74px;height:74px">' +
        '<div id="t" style="width:58px;height:58px;font-size:24px">–</div></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:14px;color:var(--muted-2);font-weight:500">Pregunta ' + s.qNum + ' de ' + s.total + '</div>' +
        '<div style="font-size:18px;font-weight:600;line-height:1.3">' + esc((s.q && s.q.text) || '') + '</div></div></div>' +
    '<div style="display:flex;align-items:baseline;gap:8px">' +
      '<div style="font-size:30px;font-weight:700;color:var(--brand)" id="ans">' + s.answered + '</div>' +
      '<div style="font-size:16px;color:var(--muted)">de <span id="conn">' + s.connected + '</span> ya respondieron</div></div>' +
    '<div id="rejilla">' + seats(s, true) + '</div>' +
    '<div id="barras">' + (s.q && s.q.open ? escritas(s) : bars(s)) + '</div>' +
    '<div id="aviso"></div>' +
  '</div>';
}

function pasoResultado(s) {
  if (s.q && s.q.open) {
    return '<div class="stack stepIn">' +
      '<div class="note"><div style="font-size:16px;font-weight:600">Respuesta abierta</div>' +
        '<div style="font-size:17px;line-height:1.35;margin-top:4px">' + esc((s.q && s.q.text) || '') + '</div>' +
        (s.why ? '<div style="font-size:15px;color:var(--muted-2);margin-top:8px">' + esc(s.why) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<div class="h2">Lo que escribieron</div>' +
        '<div style="font-size:14px;color:var(--muted-2)">' + s.answered + ' de ' + s.connected + '</div></div>' +
      escritas(s) +
      '<div class="note">Estas respuestas no dan puntos. Al terminar el juego las descargás todas en un CSV.</div>' +
      tablero(s) +
    '</div>';
  }
  const a = s.alert;
  const voz = s.voice === 'quc' ? "k'iche'" : 'español';
  const panel = a
    ? '<div class="alert warn popIn" style="border-radius:28px;padding:20px">' +
        '<h3 style="font-size:18px">' + esc(a.title) + '</h3>' +
        '<p>' + esc(s.why) + '</p>' +
        '<div style="display:flex;gap:10px">' +
          '<button class="btn primary" id="explicar" style="flex:1;height:56px;font-size:17px">Explicar en ' + voz + '</button>' +
          '<button class="btn ghost" id="saltarVoz" style="flex:0 0 110px;height:56px;font-size:17px">Saltar</button>' +
        '</div>' +
        (s.voice === 'quc' && !s.canQuc
          ? '<p><b>Esta pregunta no tiene audio en k\'iche\'.</b> El k\'iche\' no tiene voz sintética: hay que grabarlo y ponerlo en la columna audio_quc.</p>'
          : '') +
      '</div>'
    : '';
  return '<div class="stack stepIn">' +
    '<div style="border-radius:28px;background:var(--ok-bg);padding:22px 24px;display:flex;flex-direction:column;gap:6px">' +
      '<div style="font-size:14px;color:var(--ok-fg);font-weight:500;letter-spacing:.3px">RESPUESTA CORRECTA</div>' +
      '<div style="font-size:28px;font-weight:700;color:var(--ok-fg);line-height:1.15">' + esc(s.correct) + ' · ' + esc(s.correctText) + '</div>' +
      '<div style="font-size:16px;color:#1E5B36">' + esc(s.why) + '</div></div>' +
    bars(s) + panel +
    '<div class="note" style="display:flex;align-items:center;justify-content:space-between">' +
      '<div style="font-size:16px;color:var(--ink-2)">Aciertos en esta pregunta</div>' +
      '<div style="font-size:22px;font-weight:700;color:var(--brand)">' + s.correctCount + '/' + s.answered + '</div></div>' +
    tablero(s) +
  '</div>';
}

// Punteo acumulado: quién va ganando después de cada pregunta.
function tablero(s) {
  if (!(s.scored ?? s.qNum)) return '';
  const filas = (s.ranking || []).map((p, i) =>
    '<div class="rank' + (i < 3 ? ' top' : '') + '"><div class="pos">' + (i + 1) + '</div>' +
    '<div class="nm">' + esc(p.name) + '</div><div class="sc">' + p.score + '/' + (s.scored ?? s.qNum) + '</div></div>').join('');
  if (!filas) return '';
  return '<div class="card"><div class="h2">Punteo acumulado</div>' +
    '<div class="stack" style="gap:10px;margin-top:14px">' + filas + '</div></div>';
}

function pasoResumen(s) {
  const g = s.stats;
  const rank = g.ranking.map((p, i) =>
    '<div class="rank' + (i < 3 ? ' top' : '') + '"><div class="pos">' + (i + 1) + '</div>' +
    '<div class="nm">' + esc(p.name) + '</div><div class="sc">' + p.score + '/' + g.scored + '</div></div>').join('');
  const color = (p) => (p < 40 ? 'var(--bad)' : p < 70 ? 'var(--C)' : 'var(--ok)');
  const hard = g.hardest.map((h) =>
    '<div class="hard"><div class="lb"><span>' + esc(h.text) + '</span>' +
    '<b style="color:' + color(h.pct) + '">' + h.pct + '% acierto</b></div>' +
    '<div class="track"><div class="fill" style="width:' + h.pct + '%;background:' + color(h.pct) + '"></div></div></div>').join('');
  const errs = g.mistakes.map((m) =>
    '<p>En <b>' + esc(m.text) + '</b>, ' + m.n + ' alumnos ' + esc(m.err) + '</p>').join('');
  return '<div class="stack stepIn">' +
    '<div class="kpis">' +
      '<div class="kpi blue"><small>Promedio del grupo</small><b>' + (g.scored ? g.avg + '%' : '—') + '</b></div>' +
      '<div class="kpi green"><small>Participación</small><b>' + g.participation.n + '/' + g.participation.of + '</b></div></div>' +
    '<div class="card"><div class="h2">Clasificación</div>' +
      '<div class="stack" style="gap:10px;margin-top:14px">' +
      (!g.scored
        ? '<div class="note">Este juego fue sólo de respuestas escritas: no hay punteo. Descargá las respuestas abajo.</div>'
        : rank || '<div class="note">Nadie jugó esta ronda.</div>') + '</div></div>' +
    (hard ? '<div class="card"><div class="h2">Preguntas más difíciles</div>' +
      '<div class="stack" style="gap:14px;margin-top:14px">' + hard + '</div></div>' : '') +
    (errs ? '<div class="alert warn" style="border-radius:28px;padding:20px">' +
      '<h3 style="font-size:18px">Errores que se repiten</h3>' + errs + '</div>' : '') +
    '<a class="btn ghost" style="text-decoration:none" href="/api/host/reporte.csv">Guardar reporte del grupo</a>' +
    (g.openCount
      ? '<a class="btn ghost" style="text-decoration:none" href="/api/host/respuestas.csv">Descargar respuestas escritas</a>'
      : '') +
  '</div>';
}

// ================= armazón y pintado =================

const PASOS = ['topic', 'lobby', 'question', 'reveal', 'stats'];
let impMsg = '';

function contenido(s) {
  if (s.step === 'topic') return !borrador ? pasoTema(s) : borrador.i < 0 ? pasoCrearCantidad() : pasoCrearPregunta();
  if (s.step === 'lobby') return pasoSala(s);
  if (s.step === 'question') return pasoPregunta(s);
  if (s.step === 'reveal') return pasoResultado(s);
  return pasoResumen(s);
}

function armazon(s) {
  const paso = s.step === 'topic' && borrador ? 'crear' : s.step;
  const [sub, tit] = TITULOS[paso];
  const idx = PASOS.indexOf(s.step);
  const dots = [0, 1, 2].map((i) =>
    '<i class="' + (i <= idx ? 'on' : '') + (i === Math.min(idx, 2) ? ' now' : '') + '"></i>').join('');
  const conSec = s.step === 'question' || s.step === 'stats' || paso === 'crear';
  const ultima = borrador && borrador.i >= borrador.n - 1;
  const prim = s.step === 'reveal'
    ? (s.qNum >= s.total ? 'Ver resultados' : 'Siguiente pregunta')
    : ultima ? 'Guardar cuestionario' : PRINCIPAL[paso];
  return '<div class="host">' +
    '<header>' +
      '<button class="back" id="atras" aria-label="Atrás">←</button>' +
      '<div class="ttl"><b>' + esc(tit) + '</b><span>' + esc(sub) + '</span></div>' +
      '<button class="voz" id="voz">' + (s.voice === 'es' ? 'Voz ES' : "Voz K'iche'") + '</button>' +
    '</header>' +
    '<main id="root">' + contenido(s) + '</main>' +
    '<footer><div class="row">' +
      (conSec ? '<button class="btn ghost" id="sec">' +
        (paso === 'crear' ? (borrador.i > 0 ? 'Anterior' : 'Cancelar') : s.step === 'stats' ? 'Inicio' : 'Saltar') + '</button>' : '') +
      '<button class="btn primary' + (s.step === 'lobby' ? ' go' : '') + '" id="prim"' +
        (s.step === 'topic' && !borrador && !s.topic ? ' disabled' : '') + '>' + esc(prim) + '</button>' +
    '</div><div class="dots">' + dots + '</div></footer>' +
  '</div>';
}

// La llave decide cuándo se reconstruye. Lo que cambia seguido (respuestas que
// entran) se actualiza en su lugar, para no reiniciar las animaciones.
function clave(s) {
  if (s.step === 'topic') return borrador ? 'crear|' + borrador.i : 'topic|' + s.topic + '|' + s.total;
  if (s.step === 'lobby') return 'lobby|' + s.joined + '|' + s.connected;
  if (s.step === 'question') return 'question|' + s.qNum;
  if (s.step === 'reveal') return 'reveal|' + s.qNum + '|' + (s.alert ? 1 : 0) + '|' + s.voice + '|' + (s.texts ? s.texts.length : 0);
  if (s.step === 'stats') return 'stats|' + (s.stats ? s.stats.done : 0);
  return s.step;
}

function render(s) {
  st = s;
  mount(app, clave(s), () => armazon(s));

  setText('#conn', s.connected);
  setText('#ans', s.answered);
  const imp = $('#impRes');
  if (imp) imp.innerHTML = impMsg;

  if (s.step === 'question') {
    const rej = $('#rejilla');
    const bar = $('#barras');
    const avi = $('#aviso');
    if (rej) rej.innerHTML = seats(s, true);
    if (bar) bar.innerHTML = s.q && s.q.open ? escritas(s) : bars(s);
    if (avi) {
      avi.innerHTML = s.alert
        ? '<div class="alert warn popIn"><h3>' + esc(s.alert.title) + '</h3>' +
          '<p>Al terminar, Pilas puede explicar este error por voz.</p></div>'
        : '';
    }
  }
  tick();
}

function tick() {
  if (!st || st.step !== 'question') return;
  const left = secondsLeft(st.deadline);
  const ring = $('#ring');
  setText('#t', left);
  if (ring) {
    ring.style.background = ringStyle(st.deadline, st.qMs || 20000, left <= 5);
    ring.classList.toggle('low', left <= 5);
  }
}

// Un solo oyente para toda la página: nunca quedan manejadores viejos colgando.
app.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el || !st) return;
  const acciones = {
    atras: () => (borrador ? acciones.sec() : post('/api/host/atras')),
    prim: () => (borrador ? siguiente(el) : post('/api/host/avanzar')),
    sec: () => (borrador ? anterior() : post('/api/host/secundario')),
    voz: () => post('/api/host/voz', { voice: st.voice === 'es' ? 'quc' : 'es' }),
    explicar: () => post('/api/host/explicar', { lang: st.voice }),
    saltarVoz: () => post('/api/host/saltar-voz'),
    subir: () => $('#archivo').click(),
    crear: () => { borrador = { tema: '', n: 10, i: -1, preguntas: [] }; impMsg = ''; render(st); },
  };
  if (acciones[el.id]) acciones[el.id]();
});

// Pasos del asistente de creación.
function siguiente(btn) {
  if (borrador.i < 0) {
    borrador.tema = $('#tema').value;
    borrador.n = Math.max(1, Math.min(50, Number($('#cantidad').value) || 1));
    borrador.i = 0;
    return render(st);
  }
  leerPregunta();
  if (borrador.i < borrador.n - 1) { borrador.i += 1; return render(st); }
  guardar(btn);
}

function anterior() {
  if (borrador.i < 0) { borrador = null; impMsg = ''; return render(st); }   // cancelar
  leerPregunta();
  borrador.i -= 1;
  render(st);
}

async function guardar(btn) {
  btn.disabled = true;
  const r = await post('/api/host/crear', { tema: borrador.tema, preguntas: borrador.preguntas.slice(0, borrador.n) });
  btn.disabled = false;
  impMsg = mensajeImport(r);
  if (r.ok) { borrador = null; return render(st); }
  const imp = $('#impRes');
  if (imp) { imp.innerHTML = impMsg; imp.scrollIntoView({ behavior: 'smooth' }); }
}

app.addEventListener('change', async (e) => {
  if (e.target.id !== 'archivo') return;
  const file = e.target.files[0];
  if (!file) return;
  impMsg = '<div class="note" style="margin-top:12px">Leyendo ' + esc(file.name) + '…</div>';
  render(st);
  // El nombre del archivo es el nombre del tema: "Fracciones.csv" -> tema Fracciones.
  const tema = file.name.replace(/\.[^.]*$/, '');
  const r = await post('/api/host/importar?tema=' + encodeURIComponent(tema), await file.text());
  impMsg = mensajeImport(r);
  e.target.value = '';
  render(st);
});

function mensajeImport(r) {
  const d = r.data || {};
  const errores = (d.errors || []).length
    ? '<p style="margin:8px 0 0">' + d.errors.slice(0, 5).map(esc).join('<br>') + '</p>'
    : '';
  if (r.ok && !errores) return '';
  return r.ok
    ? '<div class="alert warn" style="margin-top:12px"><h3>Guardado, con avisos</h3>' + errores + '</div>'
    : '<div class="alert bad" style="margin-top:12px"><h3>No pude guardar</h3>' + errores + '</div>';
}

function arrancar() {
  app.className = '';
  everyTick(tick);
  connect('host', null, render);
}

(async () => {
  const r = await fetch('/api/auth/estado').then((x) => x.json()).catch(() => null);
  if (!r) return pantallaPin({ crear: false, error: 'No hay conexión con Pilas.' });
  if (r.isHost) return arrancar();
  pantallaPin({ crear: !r.hasPin });
})();
