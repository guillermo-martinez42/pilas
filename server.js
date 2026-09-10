// TutorBox — un solo servidor para las tres pantallas.
// No depende de ningún servicio externo: corre igual con y sin internet.
import express from 'express';
import QRCode from 'qrcode';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Room } from './lib/room.js';
import { openDb } from './lib/db.js';
import { loadBanks, saveBanks, parseCsv, templateCsv } from './lib/bank.js';
import {
  PIN_RE, COOKIE, hashPin, pinMatches, lockedFor, noteFail, noteOk,
  newToken, readCookie, setHostCookie, clearHostCookie,
} from './lib/auth.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANKS_DIR = join(HERE, 'banks');
const PORT = Number(process.env.PORT) || 80;
// En internet (Render, VPS, túnel): la dirección pública que escanean los alumnos,
// no la IP de la LAN. Sin esta variable, todo sigue igual que en el aula.
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');

const db = openDb(join(HERE, 'data', 'tutorbox.db'));
// Disco efímero (Render): el PIN se siembra desde el entorno. Si no, tras cada
// reinicio el primero que abra /maestra se vuelve la maestra.
const seedPin = process.env.TEACHER_PIN ?? '';
if (PIN_RE.test(seedPin) && !db.teacher()) {
  const { hash, salt } = hashPin(seedPin);
  db.saveTeacher(hash, salt);
}
let banks = loadBanks(BANKS_DIR);
if (!banks.length) console.error('No hay bancos de preguntas. Corré: npm run seed-banks');

const room = new Room({ banks, db, onChange: () => scheduleBroadcast() });

// ---- LAN: qué dirección teclean o escanean los alumnos ----------------

// Una PC suele tener varias tarjetas: la del router, y las virtuales de VPN,
// VirtualBox o WSL. Si elegimos mal, el QR apunta a una dirección que ningún
// celular alcanza. Por eso preferimos los rangos privados de verdad.
// HOST_IP= la fuerza a mano si hiciera falta.
function rangoPrivado(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 192 && b === 168) return 3;
  if (a === 172 && b >= 16 && b <= 31) return 2;
  if (a === 10) return 1;
  return 0;
}

function lanIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const candidatas = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) candidatas.push(ni.address);
    }
  }
  candidatas.sort((x, y) => rangoPrivado(y) - rangoPrivado(x));
  return candidatas[0] ?? '127.0.0.1';
}

let joinUrl = '';
let qrSvg = '';
async function refreshUrl(port) {
  joinUrl = PUBLIC_URL || 'http://' + lanIp() + (port === 80 ? '' : ':' + port);
  // El QR lleva el código de sala puesto: escanear es UN paso, no dos.
  // El campo manual sigue existiendo para quien teclee la dirección.
  const scan = joinUrl + '/?c=' + room.code;
  qrSvg = await QRCode.toString(scan, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}

// ---- SSE ---------------------------------------------------------------
// EventSource se reconecta solo cuando el wifi del aula parpadea. Por eso
// preferimos SSE a WebSocket: menos piezas y más aguante.

const clients = new Set();

function payload(c) {
  return Object.assign(room.viewFor(c.role, c.playerId), { joinUrl });
}

function pushTo(c) {
  try { c.res.write('data: ' + JSON.stringify(payload(c)) + '\n\n'); } catch { /* se cayó; el close lo limpia */ }
}

// Si 20 alumnos contestan a la vez no mandamos 20 ráfagas: juntamos en una.
let pending = null;
function scheduleBroadcast() {
  if (pending) return;
  pending = setTimeout(() => { pending = null; for (const c of clients) pushTo(c); }, 30);
}

const app = express();
app.disable('x-powered-by');
// Detrás de un proxy todos llegan con la IP del proxy: 5 PIN malos de un alumno
// bloquearían a la maestra. Con esto req.ip es el del celular de verdad.
if (PUBLIC_URL) app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '4mb' }));

const isHost = (req) => db.hasSession(readCookie(req, COOKIE));

app.get('/events', (req, res) => {
  const wanted = req.query.role;
  // El canal de la docente lleva la respuesta correcta y el detalle por asiento.
  // Sin esta línea, cualquier alumno se suscribe y ve todo.
  const role = wanted === 'host' && isHost(req) ? 'host' : wanted === 'screen' ? 'screen' : 'student';
  if (wanted === 'host' && role !== 'host') return res.status(401).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const c = { res, role, playerId: String(req.query.id ?? '') || null };
  clients.add(c);
  if (c.playerId) room.setOnline(c.playerId, true);
  pushTo(c);

  const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* idem */ } }, 20_000);
  req.on('close', () => {
    clearInterval(beat);
    clients.delete(c);
    // Sigue conectado si tiene otra pestaña abierta.
    if (c.playerId && ![...clients].some((x) => x.playerId === c.playerId)) room.setOnline(c.playerId, false);
  });
});

// ---- alumnos -----------------------------------------------------------

app.post('/api/join', (req, res) => {
  const { name, code, id } = req.body ?? {};
  if (String(code ?? '').trim() !== room.code) return res.status(403).json({ error: 'codigo' });
  const p = room.join(name, id);
  if (!p) return res.status(400).json({ error: 'nombre' });
  res.json({ id: p.id, seat: p.seat, name: p.name });
});

app.post('/api/answer', (req, res) => {
  const { id, letter, text } = req.body ?? {};
  const out = room.answer(String(id ?? ''), String(letter ?? text ?? ''));
  res.status(out.ok ? 200 : 409).json(out);
});

app.get('/api/qr.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'no-cache').send(qrSvg);
});

// ---- PIN de la docente -------------------------------------------------

app.get('/api/auth/estado', (req, res) => {
  res.json({ hasPin: Boolean(db.teacher()), isHost: isHost(req), locked: lockedFor(req.ip) });
});

// Sólo se puede crear el PIN si todavía no hay ninguno. Después, para cambiarlo
// hay que estar dentro (o correr npm run reset-pin en la máquina).
app.post('/api/auth/crear', (req, res) => {
  const pin = String(req.body?.pin ?? '');
  if (db.teacher() && !isHost(req)) return res.status(403).json({ error: 'ya-existe' });
  if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'formato' });
  const { hash, salt } = hashPin(pin);
  db.saveTeacher(hash, salt);
  const token = newToken();
  db.addSession(token);
  setHostCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/auth/entrar', (req, res) => {
  const left = lockedFor(req.ip);
  if (left > 0) return res.status(429).json({ error: 'bloqueado', segundos: Math.ceil(left / 1000) });
  const t = db.teacher();
  const pin = String(req.body?.pin ?? '');
  if (!t || !PIN_RE.test(pin) || !pinMatches(pin, t.salt, t.pin_hash)) {
    noteFail(req.ip);
    return res.status(401).json({ error: 'pin', segundos: Math.ceil(lockedFor(req.ip) / 1000) });
  }
  noteOk(req.ip);
  const token = newToken();
  db.addSession(token);
  setHostCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/auth/salir', (req, res) => {
  db.dropSession(readCookie(req, COOKIE));
  clearHostCookie(res);
  res.json({ ok: true });
});

// ---- acciones de la docente -------------------------------------------
// Todo pasa por aquí. Esconder botones en el HTML no es seguridad.

app.use('/api/host', (req, res, next) => {
  if (!isHost(req)) return res.status(401).json({ error: 'no-autorizado' });
  next();
});

const ok = (res) => res.json({ ok: true });
app.post('/api/host/tema', (req, res) => { room.setTopic(req.body?.id); ok(res); });
app.post('/api/host/filtro', (req, res) => { room.setFilter(req.body?.filter); ok(res); });
app.post('/api/host/cantidad', (req, res) => { room.setCount(req.body?.n); ok(res); });
app.post('/api/host/avanzar', (_req, res) => { room.advance(); ok(res); });
app.post('/api/host/secundario', (_req, res) => { room.secondary(); ok(res); });
app.post('/api/host/atras', (_req, res) => { room.back(); ok(res); });
app.post('/api/host/voz', (req, res) => { room.setVoice(req.body?.voice); ok(res); });
app.post('/api/host/explicar', (req, res) => { room.play(req.body?.lang); ok(res); });
app.post('/api/host/saltar-voz', (_req, res) => { room.skipVoice(); ok(res); });
app.post('/api/host/expulsar', (req, res) => { room.kick(Number(req.body?.seat)); ok(res); });

app.get('/api/host/plantilla.csv', (_req, res) => {
  res.type('text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="plantilla-preguntas.csv"')
    .send(templateCsv());
});

app.post('/api/host/importar', (req, res) => {
  const { banks: nuevos, ok: n, errors } = parseCsv(String(req.body ?? ''));
  if (!n) return res.status(400).json({ ok: 0, errors: errors.length ? errors : ['El archivo no traía preguntas.'] });
  saveBanks(BANKS_DIR, nuevos);
  banks = loadBanks(BANKS_DIR);
  room.banks = banks;              // los temas nuevos aparecen sin reiniciar
  if (!banks.some((b) => b.id === room.topic)) room.topic = banks[0]?.id ?? null;
  room.changed();
  res.json({ ok: n, temas: nuevos.map((b) => b.label), errors });
});

// Reporte para Excel: una fila por alumno, y abajo el detalle por pregunta.
// ';' y BOM porque es lo que Excel en español abre bien y con acentos.
const csvCell = (v) => (/[";\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const csvLine = (arr) => arr.map(csvCell).join(';');

app.get('/api/host/reporte.csv', (_req, res) => {
  const g = db.lastGame();
  if (!g) return res.status(404).type('text/plain; charset=utf-8').send('Todavía no hay ninguna partida.');
  const rows = db.answers(g.id);
  const bySeat = new Map();
  const byQ = new Map();
  let nQ = 0;

  const abiertas = new Set();
  for (const r of rows) {
    nQ = Math.max(nQ, r.q_index + 1);
    if (r.open) abiertas.add(r.q_index);
    if (!bySeat.has(r.seat)) bySeat.set(r.seat, { seat: r.seat, name: r.name, marks: [], hits: 0 });
    const s = bySeat.get(r.seat);
    s.name = r.name;
    s.marks[r.q_index] = r.letter ? (r.correct ? r.letter + ' OK' : r.letter) : '-';
    if (r.correct) s.hits += 1;

    if (!byQ.has(r.q_index)) byQ.set(r.q_index, { text: r.q_text, hits: 0, answered: 0, open: Boolean(r.open) });
    const qq = byQ.get(r.q_index);
    if (r.letter) qq.answered += 1;
    if (r.correct) qq.hits += 1;
  }
  // Las abiertas no se califican: quedan fuera del total y del porcentaje.
  const nCal = nQ - abiertas.size;

  const heads = ['Asiento', 'Alumno', 'Aciertos', 'Total', 'Porcentaje'];
  for (let i = 0; i < nQ; i++) heads.push('P' + (i + 1));
  const lines = [csvLine(heads)];
  for (const s of [...bySeat.values()].sort((a, b) => b.hits - a.hits || a.seat - b.seat)) {
    const marks = [];
    for (let i = 0; i < nQ; i++) marks.push(s.marks[i] ?? '-');
    lines.push(csvLine([s.seat, s.name, s.hits, nCal, (nCal ? Math.round((s.hits / nCal) * 100) : 0) + '%', ...marks]));
  }
  lines.push('', csvLine(['Pregunta', 'Enunciado', 'Respondieron', 'Acertaron', 'Porcentaje']));
  for (const [i, qq] of [...byQ.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(csvLine(qq.open
      ? ['P' + (i + 1), qq.text, qq.answered, 'abierta', 'sin calificar']
      : ['P' + (i + 1), qq.text, qq.answered, qq.hits, (qq.answered ? Math.round((qq.hits / qq.answered) * 100) : 0) + '%']));
  }

  const stamp = (g.started_at ?? new Date().toISOString()).slice(0, 10);
  res.type('text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="tutorbox-' + stamp + '.csv"')
    .send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

// Respuestas escritas: una fila por alumno y pregunta abierta.
app.get('/api/host/respuestas.csv', (_req, res) => {
  const g = db.lastGame();
  const rows = (g ? db.answers(g.id) : []).filter((r) => r.open && r.letter);
  if (!rows.length) {
    return res.status(404).type('text/plain; charset=utf-8')
      .send('La última partida no tuvo preguntas de respuesta abierta.');
  }
  rows.sort((a, b) => a.q_index - b.q_index || a.seat - b.seat);
  const lines = [csvLine(['Pregunta', 'Enunciado', 'Asiento', 'Alumno', 'Respuesta'])];
  for (const r of rows) lines.push(csvLine(['P' + (r.q_index + 1), r.q_text, r.seat, r.name, r.letter]));

  const stamp = (g.started_at ?? new Date().toISOString()).slice(0, 10);
  res.type('text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="tutorbox-respuestas-' + stamp + '.csv"')
    .send('\uFEFF' + lines.join('\r\n') + '\r\n');
});

// ---- páginas -----------------------------------------------------------

app.use(express.static(join(HERE, 'public'), { extensions: ['html'] }));
app.get('/maestra', (_req, res) => res.sendFile(join(HERE, 'public', 'maestra.html')));
app.get('/pantalla', (_req, res) => res.sendFile(join(HERE, 'public', 'pantalla.html')));

// ---- arranque ----------------------------------------------------------

function listen(port, canFallback) {
  const srv = app.listen(port);
  srv.on('listening', async () => {
    await refreshUrl(port);
    const line = '='.repeat(52);
    console.log('\n' + line);
    console.log('  TutorBox listo — no necesita internet');
    console.log('  Alumnos:  ' + joinUrl);
    console.log('  Maestra:  ' + joinUrl + '/maestra');
    console.log('  Pantalla: ' + joinUrl + '/pantalla');
    console.log('  Código de sala: ' + room.code);
    console.log(line + '\n');
  });
  srv.on('error', (e) => {
    if (canFallback && (e.code === 'EACCES' || e.code === 'EADDRINUSE')) {
      console.error('No pude usar el puerto ' + port + ' (' + e.code + '). Uso el 3000.');
      return listen(3000, false);
    }
    console.error('No pude arrancar:', e.message);
    process.exit(1);
  });
}

listen(PORT, PORT === 80);
