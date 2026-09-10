// Máquina de estados de la sala. El servidor es la ÚNICA fuente de verdad:
// los celulares solo dibujan lo que aquí se decide.
import { randomUUID } from 'node:crypto';

export const LETTERS = ['A', 'B', 'C', 'D'];
export const DEFAULT_SECONDS = 20;   // si la pregunta no trae los suyos
const GRACE_MS = 1000;          // margen para el viaje de red de la última respuesta
const ALERT_MIN_ANSWERS = 4;    // con 2 respuestas un 51% no significa nada
const MAX_TEXT = 200;           // lo que cabe escribir en un celular sin que sea una tarea
const ALERT_SHARE = 0.51;

export class Room {
  constructor({ banks = [], onChange = () => {}, db = null } = {}) {
    this.banks = banks;
    this.onChange = onChange;
    this.db = db;
    this.players = new Map();
    this.code = String(Math.floor(1000 + Math.random() * 9000));
    this.voice = 'es';
    this.reset();
  }

  // ---- ciclo de vida -------------------------------------------------

  reset() {
    this.stopTimer();
    this.step = 'topic';
    this.topic = this.banks[0]?.id ?? null;
    this.count = this.bank()?.questions.length ?? 0;
    this.qi = 0;
    this.questions = [];
    this.history = [];
    this.deadline = null;
    this.voicePlay = null;
    this.voiceSeq = 0;
    this.voiceDone = false;
    this.gameId = null;
    for (const p of this.players.values()) { p.score = 0; p.picks = []; }
  }

  stopTimer() { clearTimeout(this._timer); this._timer = null; }

  bank() { return this.banks.find((b) => b.id === this.topic) ?? this.banks[0] ?? null; }

  current() { return this.questions[this.qi] ?? null; }

  // Cada pregunta dura lo que la maestra le puso; los celulares dibujan el anillo con esto.
  questionMs() { return (Number(this.current()?.seconds) || DEFAULT_SECONDS) * 1000; }

  online() { return [...this.players.values()].filter((p) => p.online); }

  changed() { this.onChange(); }

  // ---- alumnos -------------------------------------------------------

  join(name, existingId) {
    const clean = String(name ?? '').trim().slice(0, 24);
    const known = existingId && this.players.get(existingId);
    if (known) {
      if (clean) known.name = clean;
      known.online = true;
      this.changed();
      return known;
    }
    if (!clean) return null;
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    let seat = 1;
    while (taken.has(seat)) seat++;
    const p = { id: randomUUID(), seat, name: clean, online: true, score: 0, picks: [] };
    this.players.set(p.id, p);
    this.changed();
    return p;
  }

  setOnline(id, online) {
    const p = this.players.get(id);
    if (!p || p.online === online) return;
    p.online = online;
    this.changed();
  }

  kick(seat) {
    for (const [id, p] of this.players) if (p.seat === seat) this.players.delete(id);
    this.changed();
  }

  // Reglas de aceptación. Todas del lado del servidor: el cliente puede mentir.
  answer(playerId, letter) {
    const p = this.players.get(playerId);
    if (!p) return { error: 'desconocido' };
    if (this.step !== 'question') return { error: 'fuera-de-tiempo' };
    if (Date.now() > this.deadline + GRACE_MS) return { error: 'tarde' };
    if (p.picks[this.qi]) return { error: 'ya-respondio' };
    const q = this.current();
    if (!q) return { error: 'opcion-invalida' };
    if (q.open) {
      // Lo escribe un niño en un celular: se recorta aquí, no en el navegador.
      const txt = String(letter ?? '').trim().slice(0, MAX_TEXT);
      if (!txt) return { error: 'vacia' };
      p.picks[this.qi] = txt;
    } else {
      if (!Object.hasOwn(q.opts, letter)) return { error: 'opcion-invalida' };
      p.picks[this.qi] = letter;
    }
    this.changed();
    // Si ya contestaron todos los conectados, no tiene sentido esperar al reloj.
    const live = this.online();
    if (live.length > 0 && live.every((x) => x.picks[this.qi])) this.toReveal();
    return { ok: true };
  }

  // ---- controles de la docente ---------------------------------------

  // Se juega el cuestionario entero, en el orden en que la maestra lo escribió.
  setTopic(id) {
    if (!this.banks.some((b) => b.id === id)) return;
    this.topic = id;
    this.count = this.bank().questions.length;
    this.changed();
  }

  setVoice(v) { this.voice = v === 'quc' ? 'quc' : 'es'; this.changed(); }

  play(lang) {
    this.voicePlay = { lang: lang === 'quc' ? 'quc' : 'es', n: ++this.voiceSeq };
    this.changed();
  }

  skipVoice() { this.voiceDone = true; this.voicePlay = null; this.changed(); }

  startGame() {
    const bank = this.bank();
    if (!bank || !bank.questions.length) return;
    this.questions = bank.questions.slice();
    this.count = this.questions.length;
    this.qi = 0;
    this.history = [];
    for (const p of this.players.values()) { p.score = 0; p.picks = []; }
    this.gameId = this.db?.startGame({ topic: bank.id, label: bank.label, count: this.count }) ?? null;
    this.startQuestion();
  }

  startQuestion() {
    this.stopTimer();
    this.step = 'question';
    const ms = this.questionMs();
    this.deadline = Date.now() + ms;
    this.voicePlay = null;
    this.voiceDone = false;
    this._timer = setTimeout(() => this.toReveal(), ms + GRACE_MS);
    this.changed();
  }

  toReveal() {
    if (this.step !== 'question') return;
    this.stopTimer();
    const q = this.current();
    // Sin q.correct (pregunta abierta) no se califica: la maestra las lee después.
    if (q.correct) for (const p of this.players.values()) if (p.picks[this.qi] === q.correct) p.score++;
    const tallies = this.tallies();
    this.history[this.qi] = {
      text: q.text,
      open: Boolean(q.open),
      correct: q.correct,
      dist: q.dist ?? null,
      err: q.err ?? null,
      tallies,
      answered: this.answered(),
    };
    this.db?.saveQuestion(this.gameId, this.qi, q, this.players);
    this.step = 'reveal';
    this.deadline = null;
    this.changed();
  }

  // Botón principal. Vive en el servidor para que nadie salte de paso desde el navegador.
  advance() {
    switch (this.step) {
      case 'topic':
        if (!this.bank()?.questions.length) return;   // sin cuestionario no hay a dónde ir
        this.step = 'lobby'; this.changed(); break;
      case 'lobby': this.startGame(); break;
      case 'question': this.toReveal(); break;
      case 'reveal':
        if (this.qi >= this.count - 1) this.finish();
        else { this.qi++; this.startQuestion(); }
        break;
      default: this.reset(); this.changed();
    }
  }

  finish() {
    this.stopTimer();
    this.step = 'stats';
    this.deadline = null;
    this.db?.finishGame(this.gameId);
    this.changed();
  }

  // Botón secundario: sólo donde significa algo.
  secondary() {
    if (this.step === 'question') {
      this.stopTimer();
      if (this.qi >= this.count - 1) this.finish();
      else { this.qi++; this.startQuestion(); }
    } else if (this.step === 'stats') { this.reset(); this.changed(); }
  }

  // Flecha atrás: en el asistente retrocede; en juego, aborta y vuelve a la sala de espera.
  back() {
    if (this.step === 'lobby') this.step = 'topic';
    else if (this.step !== 'topic') { this.stopTimer(); this.step = 'lobby'; this.deadline = null; }
    this.changed();
  }

  // ---- cálculos ------------------------------------------------------

  tallies() {
    const t = { A: 0, B: 0, C: 0, D: 0 };
    if (this.current()?.open) return t;
    for (const p of this.players.values()) {
      const l = p.picks[this.qi];
      if (l) t[l] = (t[l] ?? 0) + 1;
    }
    return t;
  }

  answered() { return [...this.players.values()].filter((p) => p.picks[this.qi]).length; }

  // Respuestas escritas de la pregunta actual, para que la maestra las vea en vivo.
  texts() {
    return [...this.players.values()]
      .filter((p) => p.picks[this.qi])
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ seat: p.seat, name: p.name, text: p.picks[this.qi] }));
  }

  // Preguntas ya jugadas que sí dan puntaje (las abiertas no).
  scored() { return this.history.filter((h) => h && !h.open).length; }

  // "Más de la mitad eligió el MISMO error": ahí hay un malentendido que vale explicar.
  alert() {
    const q = this.current();
    if (!q?.dist || this.voiceDone) return null;
    const answered = this.answered();
    if (answered < ALERT_MIN_ANSWERS) return null;
    const n = this.tallies()[q.dist] ?? 0;
    if (n / answered <= ALERT_SHARE) return null;
    const tail = q.err ?? ('eligieron ' + q.opts[q.dist] + '.');
    return { n, answered, title: n + ' de ' + answered + ' ' + tail, text: q.why ?? '' };
  }

  ranking() {
    return [...this.players.values()]
      .map((p) => ({ seat: p.seat, name: p.name, score: p.score, played: p.picks.filter(Boolean).length }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
  }

  stats() {
    const done = this.history.length;
    const scored = this.scored();
    const players = [...this.players.values()];
    const participated = players.filter((p) => p.picks.filter(Boolean).length > 0);
    const avg = scored && participated.length
      ? Math.round((participated.reduce((s, p) => s + p.score, 0) / (participated.length * scored)) * 100)
      : 0;
    const hardest = this.history
      .filter((h) => !h.open)
      .map((h) => ({
        text: h.text,
        pct: h.answered ? Math.round(((h.tallies[h.correct] ?? 0) / h.answered) * 100) : 0,
      }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
    const mistakes = this.history
      .filter((h) => !h.open && h.dist && h.answered >= ALERT_MIN_ANSWERS && (h.tallies[h.dist] ?? 0) / h.answered > ALERT_SHARE)
      .map((h) => ({ text: h.text, n: h.tallies[h.dist], err: h.err ?? 'eligieron la misma opción incorrecta.' }))
      .slice(0, 4);
    return {
      avg,
      participation: { n: participated.length, of: players.length },
      ranking: this.ranking(),
      hardest,
      mistakes,
      done,
      scored,
      openCount: done - scored,
    };
  }

  // ---- vistas por rol -------------------------------------------------
  // Cada rol recibe una carga distinta. La respuesta correcta NO viaja al
  // alumno ni a la pantalla hasta el paso 'reveal': si no, se lee en la
  // pestaña de red del navegador.

  base() {
    return {
      step: this.step,
      code: this.code,
      qNum: this.qi + 1,
      total: this.count,
      deadline: this.deadline,
      qMs: this.questionMs(),
      now: Date.now(),
      voice: this.voice,
      connected: this.online().length,
      joined: this.players.size,
    };
  }

  publicQuestion() {
    const q = this.current();
    return q ? { text: q.text, opts: q.opts ?? {}, open: Boolean(q.open) } : null;
  }

  studentView(playerId) {
    const p = this.players.get(playerId);
    const v = this.base();
    v.you = p ? { seat: p.seat, name: p.name, score: p.score, picked: p.picks[this.qi] ?? null } : null;
    if (this.step === 'question' || this.step === 'reveal') v.q = this.publicQuestion();
    if (this.step === 'reveal') {
      const q = this.current();
      v.open = Boolean(q.open);
      if (!q.open) {
        v.correct = q.correct;
        v.correctText = q.opts[q.correct];
      }
      v.why = q.why ?? '';
    }
    return v;
  }

  screenView() {
    const v = this.base();
    if (this.step === 'question' || this.step === 'reveal') v.q = this.publicQuestion();
    if (this.step === 'reveal') {
      const q = this.current();
      v.open = Boolean(q.open);
      if (!q.open) {
        v.correct = q.correct;
        v.correctText = q.opts[q.correct];
      }
      v.why = q.why ?? '';
      v.audio = { es: q.audio_es ?? null, quc: q.audio_quc ?? null };
      v.voicePlay = this.voicePlay;
    }
    if (this.step === 'stats') v.podium = this.ranking().slice(0, 3);
    v.seats = [...this.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ seat: p.seat, name: p.name, online: p.online }));
    return v;
  }

  hostView() {
    const v = this.base();
    const bank = this.bank();
    // Sólo el cuestionario cargado: el último que se subió o se creó.
    v.topic = bank?.id ?? null;
    v.topicLabel = bank?.label ?? '';
    v.seats = [...this.players.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ seat: p.seat, name: p.name, online: p.online, mark: p.picks[this.qi] ?? null }));
    if (this.step === 'question' || this.step === 'reveal') {
      const q = this.current();
      v.q = { text: q.text, opts: q.opts ?? {}, open: Boolean(q.open) };
      v.tallies = this.tallies();
      v.answered = this.answered();
      v.alert = this.alert();
      if (q.open) v.texts = this.texts();   // lo que van escribiendo, en vivo
      if (this.step === 'reveal') {
        v.why = q.why ?? '';
        v.canQuc = Boolean(q.audio_quc);
        v.voiceDone = this.voiceDone;
        v.ranking = this.ranking();   // punteo acumulado: quién va ganando tras cada pregunta
        v.scored = this.scored();
        if (!q.open) {
          v.correct = q.correct;
          v.correctText = q.opts[q.correct];
          v.correctCount = v.tallies[q.correct] ?? 0;
        }
      }
    }
    if (this.step === 'stats') v.stats = this.stats();
    return v;
  }

  viewFor(role, playerId) {
    if (role === 'host') return this.hostView();
    if (role === 'screen') return this.screenView();
    return this.studentView(playerId);
  }
}
