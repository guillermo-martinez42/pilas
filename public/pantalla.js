// Pantalla del aula (HDMI). Sólo muestra lo que puede ver todo el salón:
// nunca respuestas por alumno, y la correcta sólo cuando la maestra revela.
import { connect, esc, mount, $, setText, secondsLeft, ringStyle, everyTick } from '/bus.js';

const QUESTION_MS = 20000;
const root = $('#root');
let st = null;
let lastVoice = 0;

const join = (s) =>
  '<div class="join">' +
    '<img src="/api/qr.svg" alt="Código QR para entrar al juego">' +
    '<div>' +
      '<div class="muted">ENTRA CON TU CELULAR</div>' +
      '<div class="url">' + esc(s.joinUrl) + '</div>' +
      '<div class="light">Código de sala: <b>' + esc(s.code) + '</b></div>' +
    '</div>' +
  '</div>';

const hint = '<div class="hint">Si tu celular dice que esta red no tiene internet, elegí «Mantener conexión».</div>';

function skeleton(s) {
  if (s.step === 'topic' || s.step === 'count') {
    return '<div class="pane stepIn">' +
      '<div class="logo" style="width:96px;height:96px;border-radius:30px;font-size:46px">T</div>' +
      '<h1 class="title">TutorBox está listo</h1>' +
      '<div class="light">Esperando a que la maestra inicie el juego</div>' +
      join(s) + '</div>' + hint;
  }
  if (s.step === 'lobby') {
    return '<div class="pane stepIn">' +
      '<div class="muted">CÓDIGO DE SALA</div>' +
      '<p class="code">' + esc(s.code) + '</p>' +
      '<div class="light"><b id="n">0</b> alumnos listos</div>' +
      join(s) + '</div>' + hint;
  }
  if (s.step === 'question') {
    const opts = s.q?.open
      ? '<div class="light" style="font-size:clamp(20px,2.6vw,34px)">Escribí tu respuesta en el celular.</div>'
      : Object.entries(s.q?.opts ?? {}).map(([k, v]) =>
        '<div class="opt ' + k + '"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div></div>').join('');
    return '<div class="pane q stepIn">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:20px">' +
        '<div class="muted">Pregunta ' + s.qNum + ' de ' + s.total + '</div>' +
        '<div class="ring" id="ring" style="width:11vh;height:11vh">' +
          '<div id="t" style="width:8.8vh;height:8.8vh;background:#062D3F;color:#fff;font-size:4vh">–</div>' +
        '</div>' +
      '</div>' +
      '<p class="qtext">' + esc(s.q?.text ?? '') + '</p>' +
      '<div class="opts">' + opts + '</div></div>';
  }
  if (s.step === 'reveal') {
    if (s.open) {
      return '<div class="pane stepIn">' +
        '<div class="muted">RESPUESTA ABIERTA</div>' +
        '<h1 class="title">¡Gracias por escribir!</h1>' +
        '<div class="light" style="max-width:70vw">' + esc(s.why || 'Su maestra va a leer las respuestas.') + '</div></div>';
    }
    return '<div class="pane stepIn">' +
      '<div class="muted">RESPUESTA CORRECTA</div>' +
      '<div class="popIn" style="display:flex;align-items:center;gap:3vw">' +
        '<div class="opt ' + s.correct + '" style="width:11vh;height:11vh;padding:0;justify-content:center;border-radius:24px;min-height:0">' +
          '<div style="font-size:5vh;font-weight:700">' + esc(s.correct) + '</div></div>' +
        '<div style="font-size:clamp(40px,7vw,110px);font-weight:700;line-height:1">' + esc(s.correctText) + '</div>' +
      '</div>' +
      '<div class="light" style="max-width:70vw">' + esc(s.why) + '</div></div>';
  }
  if (s.step === 'stats') {
    // Indexados por PUESTO: 1.º oro y el más alto, 2.º azul, 3.º verde.
    const heights = ['21vh', '15vh', '11vh'];
    const colors = ['#C98A00', '#1368CE', '#1E7B2E'];
    const order = [1, 0, 2];   // pero se dibujan 2.º, 1.º, 3.º — como un podio de verdad
    const cols = order.map((i) => {
      const p = (s.podium ?? [])[i];
      if (!p) return '';
      return '<div class="col"><div class="light">' + esc(p.name) + '</div>' +
        '<div class="bar" style="height:' + heights[i] + ';background:' + colors[i] + '">' + (i + 1) + '</div></div>';
    }).join('');
    return '<div class="pane stepIn"><h1 class="title">¡Buen trabajo, grupo!</h1>' +
      '<div class="podium">' + cols + '</div></div>';
  }
  return '';
}

function speak(s) {
  const vp = s.voicePlay;
  if (!vp || vp.n === lastVoice) return;
  lastVoice = vp.n;
  const file = s.audio?.[vp.lang];
  if (file) { new Audio('/audio/' + file).play().catch(() => {}); return; }
  // Sin archivo: el español lo puede leer la voz del sistema (funciona sin
  // internet). El k'iche' no tiene voz sintética en ningún sistema.
  if (vp.lang === 'es' && 'speechSynthesis' in window && s.why) {
    const u = new SpeechSynthesisUtterance(s.why);
    u.lang = 'es-ES';
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

function render(s) {
  st = s;
  // 'topic' y 'count' dibujan la misma espera: una sola llave, para no
  // reanimar el proyector cuando la maestra avanza entre esos dos pasos.
  const paso = (s.step === 'topic' || s.step === 'count') ? 'idle' : s.step;
  mount(root, paso + ':' + s.qNum, () => skeleton(s));
  setText('#n', s.connected);
  if (s.step === 'reveal') speak(s);
  tick();
}

function tick() {
  if (!st || st.step !== 'question') return;
  const left = secondsLeft(st.deadline);
  const ring = $('#ring');
  setText('#t', left);
  if (ring) {
    ring.style.background = ringStyle(st.deadline, QUESTION_MS, left <= 5);
    ring.classList.toggle('low', left <= 5);
  }
}

everyTick(tick);
connect('screen', null, render);
