// Celular del alumno. Sólo ve la pregunta y el tiempo; la respuesta correcta
// llega del servidor únicamente cuando la maestra revela.
import { connect, post, esc, mount, $, setText, secondsLeft, ringStyle, everyTick, saveLocal, readLocal } from '/bus.js';

const shell = $('#shell');
const root = $('#root');
const who = $('#who');
let me = readLocal('tb.me');
let st = null;
let picked = null;      // eco local para que el toque se sienta inmediato

// ---- entrar ----------------------------------------------------------

function formEntrar(code, error) {
  root.innerHTML =
    '<div class="center left stepIn">' +
      '<div class="logo">T</div>' +
      '<div><h1 class="big">¿Cómo te llamas?</h1>' +
      '<p class="lead" style="max-width:none">Escribí tu nombre para entrar al juego de tu maestra.</p></div>' +
      (code ? '' : '<input class="field code" id="code" inputmode="numeric" maxlength="4" placeholder="Código" aria-label="Código de sala">') +
      '<input class="field" id="name" maxlength="24" placeholder="Tu nombre" aria-label="Tu nombre" autocomplete="given-name">' +
      (error ? '<div class="alert bad"><h3>' + esc(error) + '</h3></div>' : '') +
      '<button class="btn primary" id="go" disabled>Entrar</button>' +
    '</div>';

  const name = $('#name');
  const codeEl = $('#code');
  const go = $('#go');
  const valid = () => name.value.trim() && (code || (codeEl && codeEl.value.trim().length === 4));
  const check = () => { go.disabled = !valid(); };
  name.addEventListener('input', check);
  if (codeEl) codeEl.addEventListener('input', check);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && valid()) go.click(); });
  go.addEventListener('click', async () => {
    go.disabled = true;
    const sala = code || codeEl.value.trim();
    const r = await post('/api/join', { name: name.value, code: sala });
    if (!r.ok) {
      return formEntrar(code, r.data && r.data.error === 'codigo' ? 'Ese código no es el de esta sala.' : 'Escribí tu nombre.');
    }
    me = r.data;
    saveLocal('tb.me', me);
    saveLocal('tb.code', sala);
    arrancar();
  });
  name.focus();
}

// ---- pantallas del juego ---------------------------------------------

function esperando(s) {
  const enSala = s.step === 'lobby';
  return '<div class="center stepIn">' +
    '<div class="avatar">' + esc((me.name || '?').trim().charAt(0).toUpperCase()) + '</div>' +
    '<h1 class="big">' + (enSala ? '¡Listo, ' + esc(me.name) + '!' : 'Hola, ' + esc(me.name)) + '</h1>' +
    '<p class="lead">' + (enSala ? 'Tu maestra empezará el juego en un momento.' : 'Tu maestra está preparando el juego.') + '</p>' +
    '<div class="badge">Mando ' + String(me.seat).padStart(2, '0') + '</div>' +
  '</div>';
}

function escribiendo(s) {
  return '<div class="qhead">' +
      '<div style="font-size:15px;color:var(--muted-2);font-weight:500">Pregunta ' + s.qNum + ' de ' + s.total + '</div>' +
      '<div class="ring" id="ring" style="width:46px;height:46px">' +
        '<div id="t" style="width:36px;height:36px;font-size:17px">–</div></div>' +
    '</div>' +
    '<p class="qtext">' + esc((s.q && s.q.text) || '') + '</p>' +
    '<textarea class="field libre" id="libre" rows="4" maxlength="200" ' +
      'placeholder="Escribí tu respuesta" aria-label="Tu respuesta"></textarea>' +
    '<button class="btn primary" id="enviar" disabled>Enviar</button>';
}

function jugando(s) {
  const opts = (s.q && s.q.opts) || {};
  const tiles = Object.entries(opts).map(([k, v]) =>
    '<button class="tile ' + k + '" data-l="' + k + '"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span></button>').join('');
  return '<div class="qhead">' +
      '<div style="font-size:15px;color:var(--muted-2);font-weight:500">Pregunta ' + s.qNum + ' de ' + s.total + '</div>' +
      '<div class="ring" id="ring" style="width:46px;height:46px">' +
        '<div id="t" style="width:36px;height:36px;font-size:17px">–</div></div>' +
    '</div>' +
    '<p class="qtext">' + esc((s.q && s.q.text) || '') + '</p>' +
    '<div class="tiles">' + tiles + '</div>';
}

function enviada(mine, abierta) {
  const marca = abierta
    ? '<div class="mark popIn">✓</div>'
    : '<div class="mark popIn" style="background:var(--' + mine + ')">' + esc(mine) + '</div>';
  return '<div class="center stepIn">' + marca +
    '<h1 class="big">Respuesta enviada</h1>' +
    (abierta ? '<p class="lead">«' + esc(mine) + '»</p>' : '') +
    '<p class="lead">Esperá a que todos terminen.</p></div>';
}

function resultado(s) {
  const mine = (s.you && s.you.picked) || null;
  if (s.open) {
    return '<div class="center stepIn">' +
      '<div class="mark popIn">' + (mine ? '✓' : '–') + '</div>' +
      '<h1 class="big">' + (mine ? '¡Gracias!' : 'Sin respuesta') + '</h1>' +
      '<p class="lead">' + (mine ? 'Tu maestra va a leer lo que escribiste.' : esc(s.why || 'Esta era para escribir.')) + '</p>' +
      '<div class="badge">' + ((s.you && s.you.score) || 0) + ' correctas hasta ahora</div></div>';
  }
  const win = mine && mine === s.correct;
  return '<div class="center stepIn">' +
    '<div class="mark popIn">' + (win ? '✓' : mine ? '✕' : '–') + '</div>' +
    '<h1 class="big">' + (win ? '¡Correcto!' : mine ? 'Casi' : 'Sin respuesta') + '</h1>' +
    '<p class="lead">' + (win ? esc(s.why) : 'La respuesta era ' + esc(s.correct) + ' · ' + esc(s.correctText)) + '</p>' +
    '<div class="badge">' + ((s.you && s.you.score) || 0) + ' de ' + s.qNum + ' correctas</div></div>';
}

function final(s) {
  return '<div class="center stepIn">' +
    '<div style="font-size:15px;color:var(--screen-muted);letter-spacing:1px">TERMINÓ EL JUEGO</div>' +
    '<div class="score">' + ((s.you && s.you.score) || 0) + '</div>' +
    '<p class="lead">respuestas correctas de ' + s.total + '</p>' +
    '<h1 class="big" style="max-width:260px">¡Buen trabajo, ' + esc(me.name) + '!</h1></div>';
}

// ---- pintar -----------------------------------------------------------

function render(s) {
  st = s;
  if (s.you) me = Object.assign({}, me, { seat: s.you.seat, name: s.you.name });
  const mine = (s.you && s.you.picked) || picked;
  who.innerHTML = '<span class="dot"></span> ' + esc(me.name);

  let vista = s.step;
  if (s.step === 'question') vista = mine ? 'sent:' + mine : 'play:' + s.qNum;
  if (s.step === 'reveal') vista = 'rev:' + s.qNum;

  // Una pregunta abierta no se gana ni se pierde: la pantalla no se pinta.
  const califica = s.step === 'reveal' && !s.open;
  shell.classList.toggle('win', califica && mine === s.correct);
  shell.classList.toggle('lose', califica && mine !== s.correct);
  shell.classList.toggle('over', s.step === 'stats');

  const abierta = Boolean(s.q && s.q.open);
  const nuevo = mount(root, vista, () => {
    if (s.step === 'question') return mine ? enviada(mine, abierta) : (abierta ? escribiendo(s) : jugando(s));
    if (s.step === 'reveal') return resultado(s);
    if (s.step === 'stats') return final(s);
    return esperando(s);
  });

  if (nuevo && s.step === 'question' && !mine && abierta) {
    const caja = $('#libre');
    const enviar = $('#enviar');
    caja.addEventListener('input', () => { enviar.disabled = !caja.value.trim(); });
    enviar.addEventListener('click', async () => {
      const txt = caja.value.trim();
      if (!txt || picked) return;
      picked = txt;
      enviar.disabled = true;
      const r = await post('/api/answer', { id: me.id, text: txt });
      if (!r.ok) { picked = null; render(st); }
    });
    caja.focus();
  }
  if (nuevo && s.step === 'question' && !mine && !abierta) {
    for (const b of root.querySelectorAll('.tile')) {
      b.addEventListener('click', async () => {
        if (picked) return;
        picked = b.dataset.l;
        for (const o of root.querySelectorAll('.tile')) if (o !== b) o.classList.add('dim');
        const r = await post('/api/answer', { id: me.id, letter: picked });
        // Si el servidor dijo que no (tarde o repetida), manda el servidor.
        if (!r.ok) { picked = null; render(st); }
      });
    }
  }
  if (s.step !== 'question') picked = null;
  tick();
}

function tick() {
  if (!st || st.step !== 'question') return;
  if ((st.you && st.you.picked) || picked) return;
  const left = secondsLeft(st.deadline);
  const ring = $('#ring');
  setText('#t', left);
  if (ring) {
    ring.style.background = ringStyle(st.deadline, st.qMs || 20000, left <= 5);
    ring.classList.toggle('low', left <= 5);
  }
}

function arrancar() {
  everyTick(tick);
  connect('student', me.id, render);
}

// Al abrir: si ya jugábamos en este teléfono, volvemos al mismo asiento.
// (Tras reiniciar el servidor el código de sala cambia: ahí pedimos de nuevo.)
(async () => {
  const desdeQr = new URLSearchParams(location.search).get('c');
  const guardado = readLocal('tb.code', '');
  if (me && me.id) {
    const r = await post('/api/join', { id: me.id, name: me.name, code: desdeQr || guardado });
    if (r.ok) { me = r.data; saveLocal('tb.me', me); return arrancar(); }
  }
  formEntrar(desdeQr, null);
})();
