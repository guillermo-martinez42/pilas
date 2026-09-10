// Lo compartido por las tres pantallas: la conexión con el servidor,
// el reloj y cuatro ayudas de DOM. Sin framework y sin paso de build.

export const LETTERS = ['A', 'B', 'C', 'D'];

// Los nombres los escriben los alumnos: nunca van al DOM sin escapar.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

let offset = 0;   // hora del servidor menos la del celular

// El cronómetro lo manda el servidor como fecha límite absoluta. Cada teléfono
// mide su propio desfase, así el conteo se ve igual aunque tenga la hora mal.
export function syncClock(state) {
  if (typeof state.now === 'number') offset = state.now - Date.now();
}

export function secondsLeft(deadline) {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000));
}

export function connect(role, id, onState) {
  const qs = new URLSearchParams({ role });
  if (id) qs.set('id', id);
  const es = new EventSource('/events?' + qs);
  es.onmessage = (ev) => {
    const s = JSON.parse(ev.data);
    syncClock(s);
    onState(s);
  };
  // EventSource se reconecta solo; solo avisamos en pantalla.
  es.onerror = () => document.body.classList.add('offline');
  es.onopen = () => document.body.classList.remove('offline');
  return es;
}

export async function post(path, body) {
  const isText = typeof body === 'string';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': isText ? 'text/csv' : 'application/json' },
    body: isText ? body : JSON.stringify(body ?? {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* algunas respuestas no traen cuerpo */ }
  return { ok: res.ok, status: res.status, data };
}

// Reconstruye sólo cuando cambia la "llave" (normalmente el paso). Así las
// animaciones no se reinician con cada respuesta que llega.
export function mount(root, key, build) {
  if (root.dataset.k === key) return false;
  // La llave se guarda DESPUÉS de construir: si build() falla, el próximo
  // estado vuelve a intentar en vez de dejar la pantalla vieja congelada.
  root.innerHTML = build();
  root.dataset.k = key;
  return true;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setText(sel, value, root = document) {
  const el = $(sel, root);
  if (el) el.textContent = String(value ?? '');
}

// Anillo del cronómetro: un conic-gradient que se vacía.
export function ringStyle(deadline, totalMs, low) {
  const left = deadline ? Math.max(0, deadline - (Date.now() + offset)) : 0;
  const pct = Math.max(0, Math.min(100, (left / totalMs) * 100));
  const color = low ? '#B3261E' : '#0B6E99';
  return 'conic-gradient(' + color + ' ' + pct + '%, #D3E4EC ' + pct + '%)';
}

// Un solo reloj por página, a 4 cuadros por segundo: suficiente y barato.
export function everyTick(fn) {
  fn();
  return setInterval(fn, 250);
}

export function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
}

export function readLocal(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
