// Chequeo del núcleo. Sin framework: node test-room.js
// Lo que importa aquí es que el servidor no se deje engañar por el cliente.
import assert from 'node:assert/strict';
import { Room } from './lib/room.js';

// Un banco de prueba con las tres preguntas y un distractor en la primera,
// para el aviso de "más de la mitad eligió el mismo error".
const banks = [{
  id: 'sumas', label: 'Sumas', cat: 'General', grade: 'todos', glyph: 'S', order: 1000,
  questions: [
    { text: '24 + 18', opts: { A: '42', B: '32', C: '41', D: '46' }, correct: 'A', dist: 'B', why: 'Se lleva 1.', err: 'olvidaron llevar la decena.' },
    { text: '3 + 3', opts: { A: '5', B: '6', C: '7' }, correct: 'B' },
    { text: '1 + 1', opts: { A: '2', B: '3' }, correct: 'A' },
  ],
}];

const nuevo = () => new Room({ banks });
const jugar = (r) => { r.advance(); r.advance(); };   // topic -> lobby -> question

let room = nuevo();
try {
  // --- asientos ---
  const a = room.join('Ana');
  const b = room.join('Beto');
  const c = room.join('Carla');
  assert.deepEqual([a.seat, b.seat, c.seat], [1, 2, 3], 'los asientos se reparten en orden');
  assert.equal(room.join('', a.id).id, a.id, 'reconectarse con el mismo id no crea otro alumno');
  assert.equal(room.join('   '), null, 'sin nombre no entra');

  // --- el asistente vive en el servidor ---
  assert.equal(room.step, 'topic');
  assert.equal(room.count, 3, 'se juega el cuestionario entero: no se pregunta cuántas');
  jugar(room);
  assert.equal(room.step, 'question', 'dos avances llegan a la primera pregunta');
  assert.equal(room.current().text, '24 + 18', 'en el orden en que la maestra las escribió');
  assert.ok(room.deadline > Date.now(), 'la pregunta trae fecha límite');

  // --- LA PRUEBA QUE IMPORTA: la respuesta correcta no viaja antes de tiempo ---
  const vAlumno = room.studentView(a.id);
  const vPantalla = room.screenView();
  assert.equal(vAlumno.correct, undefined, 'el alumno NO recibe la correcta durante la pregunta');
  assert.equal(vPantalla.correct, undefined, 'la pantalla NO recibe la correcta durante la pregunta');
  assert.equal(JSON.stringify(vAlumno).includes('"correct"'), false, 'ni escondida en q');
  assert.ok(vAlumno.q.text && vAlumno.q.opts, 'pero sí recibe enunciado y opciones');
  assert.ok(room.hostView().q, 'la docente sí ve la pregunta completa');

  // --- reglas de aceptación ---
  const q = room.current();
  const mala = Object.keys(q.opts).find((l) => l !== q.correct);
  assert.deepEqual(room.answer(a.id, q.correct), { ok: true });
  assert.equal(room.answer(a.id, mala).error, 'ya-respondio', 'no se puede cambiar la respuesta');
  assert.equal(room.answer('inventado', 'A').error, 'desconocido', 'un id falso no cuenta');
  assert.equal(room.answer(b.id, 'Z').error, 'opcion-invalida', 'una letra inventada no cuenta');

  room.deadline = Date.now() - 5000;                      // simulamos que se acabó el tiempo
  assert.equal(room.answer(b.id, q.correct).error, 'tarde', 'fuera de tiempo no cuenta');
  room.deadline = Date.now() + 20_000;

  // --- todos contestaron: no hay que esperar al reloj ---
  room.answer(b.id, mala);
  assert.equal(room.step, 'question', 'con uno pendiente sigue la pregunta');
  room.answer(c.id, mala);
  assert.equal(room.step, 'reveal', 'cuando contestan todos, pasa solo al resultado');

  // --- ahora sí se revela ---
  const rev = room.studentView(a.id);
  assert.equal(rev.correct, q.correct, 'en el resultado el alumno sí recibe la correcta');
  assert.equal(room.players.get(a.id).score, 1, 'suma punto quien acertó');
  assert.equal(room.players.get(b.id).score, 0, 'no suma quien falló');
  assert.equal(room.answer(a.id, 'A').error, 'fuera-de-tiempo', 'ya no se responde en el resultado');

  // --- alerta de "más de la mitad se equivocó igual" ---
  room = nuevo();
  const grupo = ['Ana', 'Beto', 'Carla', 'Dina', 'Eli'].map((n) => room.join(n));
  jugar(room);
  const q2 = room.current();
  assert.equal(room.alert(), null, 'sin respuestas no hay alerta');
  for (const p of grupo.slice(0, 4)) room.answer(p.id, q2.dist);
  const al = room.alert();
  assert.ok(al && al.n === 4, 'cuatro en el mismo error dispara la alerta');
  assert.ok(al.title.includes('4 de 4'), 'la alerta dice cuántos de cuántos');
  room.skipVoice();
  assert.equal(room.alert(), null, 'si la maestra la salta, no vuelve a aparecer');

  // --- la flecha atrás en juego aborta, no rompe ---
  room.back();
  assert.equal(room.step, 'lobby', 'atrás durante el juego vuelve a la sala de espera');
  assert.equal(room.deadline, null, 'y apaga el cronómetro');

  // --- partida completa hasta las estadísticas ---
  room = nuevo();
  const uno = room.join('Ana');
  const dos = room.join('Beto');
  jugar(room);
  for (let i = 0; i < 3; i++) {
    const qq = room.current();
    room.answer(uno.id, qq.correct);
    room.answer(dos.id, Object.keys(qq.opts).find((l) => l !== qq.correct));
    assert.equal(room.step, 'reveal', 'pregunta ' + (i + 1) + ' revelada');
    // La maestra ve el punteo acumulado en cada revelación, no sólo al final.
    const hv = room.hostView();
    assert.equal(hv.ranking[0].name, 'Ana', 'Ana encabeza el punteo acumulado');
    assert.equal(hv.ranking[0].score, i + 1, 'el punteo suma pregunta a pregunta');
    room.advance();
  }
  assert.equal(room.step, 'stats', 'después de la última pregunta vienen las estadísticas');
  const s = room.stats();
  assert.equal(s.done, 3);
  assert.equal(s.ranking[0].name, 'Ana', 'Ana va primera');
  assert.equal(s.ranking[0].score, 3);
  assert.equal(s.participation.n, 2);
  assert.equal(s.avg, 50, 'promedio del grupo: 3 de 3 y 0 de 3 = 50%');
  assert.equal(s.hardest.length, 3);

  // --- preguntas de respuesta abierta ---
  room.stopTimer();
  room = new Room({
    banks: [{
      id: 'abierto', label: 'Abierto', cat: 'Lenguaje', grade: 'todos', glyph: 'E',
      questions: [
        { text: '¿Qué aprendiste hoy?', open: true, why: 'La maestra las lee después.' },
        { text: '2 + 2', opts: { A: '4', B: '5' }, correct: 'A' },
        { text: 'Contá un ejemplo', open: true },
      ],
    }],
  });
  const ana = room.join('Ana');
  const beto = room.join('Beto');
  jugar(room);
  let abiertas = 0;
  for (let i = 0; i < 3; i++) {
    const q = room.current();
    if (q.open) {
      abiertas += 1;
      assert.equal(room.answer(ana.id, '   ').error, 'vacia', 'una respuesta en blanco no cuenta');
      assert.deepEqual(room.answer(ana.id, '  Aprendí a sumar  '), { ok: true });
      assert.equal(room.players.get(ana.id).picks[room.qi], 'Aprendí a sumar', 'se guarda recortada');
      assert.equal(room.answer(beto.id, 'x'.repeat(500)).ok, true);
      assert.equal(room.players.get(beto.id).picks[room.qi].length, 200, 'el texto se limita a 200');
      assert.equal(room.step, 'reveal', 'con todos escritos se revela sin esperar al reloj');
      assert.equal(room.hostView().texts.length, 2, 'la maestra ve las dos respuestas escritas');
      assert.equal(room.studentView(ana.id).correct, undefined, 'una abierta no tiene letra correcta');
      assert.deepEqual(room.tallies(), { A: 0, B: 0, C: 0, D: 0 }, 'el texto no se cuenta como letra');
    } else {
      room.answer(ana.id, q.correct);
      room.answer(beto.id, Object.keys(q.opts).find((l) => l !== q.correct));
      assert.equal(room.step, 'reveal');
    }
    room.advance();
  }
  assert.equal(abiertas, 2, 'dos de las tres eran abiertas');
  assert.equal(room.step, 'stats');
  assert.equal(room.players.get(ana.id).score, 1, 'sólo la de opciones dio punto');
  const sa = room.stats();
  assert.equal(sa.done, 3);
  assert.equal(sa.scored, 1, 'sólo una de las tres califica');
  assert.equal(sa.openCount, 2);
  assert.equal(sa.avg, 50, 'promedio sobre la calificable: Ana 1, Beto 0');
  assert.equal(sa.hardest.length, 1, 'las abiertas no entran en las más difíciles');

  // --- sin cuestionarios no se puede avanzar ---
  room.stopTimer();
  room = new Room({ banks: [] });
  room.advance();
  assert.equal(room.step, 'topic', 'sin cuestionario, Continuar no hace nada');
  assert.equal(room.hostView().topics.length, 0);

  console.log('OK — todos los chequeos pasaron');
} finally {
  room.stopTimer();
}
