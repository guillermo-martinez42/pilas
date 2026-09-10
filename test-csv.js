import { templateCsv, parseCsv } from './lib/bank.js';
import assert from 'node:assert/strict';

// 1) Ida y vuelta con la plantilla que baja la maestra (BOM + ';').
const t = templateCsv();
const r1 = parseCsv(t);
assert.equal(r1.ok, 4, 'las 4 filas de ejemplo se leen');
assert.equal(r1.errors.length, 0, 'sin errores: ' + r1.errors.join(' | '));
assert.equal(r1.banks.length, 3, 'tres temas');
const sumas = r1.banks.find((b) => b.id === 'sumas-y-restas');
assert.equal(sumas.questions.length, 2);
assert.equal(sumas.questions[0].correct, 'B');
assert.equal(sumas.questions[0].dist, 'C');

// La fila de ejemplo con "correcta: abierta" se vuelve pregunta para escribir.
const libre = r1.banks.find((b) => b.id === 'escritura').questions[0];
assert.equal(libre.open, true, 'la fila "abierta" queda como pregunta abierta');
assert.equal(libre.opts, undefined, 'y sin opciones A-D');
assert.equal(libre.correct, undefined, 'y sin letra correcta');

// Escribir "abierta" y ADEMÁS opciones: manda "abierta".
const mixta = parseCsv('tema;pregunta;A;B;correcta\nLibre;Contá algo;uno;dos;ABIERTA\n');
assert.equal(mixta.ok, 1);
assert.equal(mixta.banks[0].questions[0].open, true);

// Una fila sin opciones y sin "abierta" sigue siendo un error, no una abierta por accidente.
const olvido = parseCsv('tema;pregunta;A;B;correcta\nLibre;Sin opciones;;;\n');
assert.equal(olvido.ok, 0, 'olvidar las opciones no crea una abierta sin querer');
assert.equal(olvido.errors.length, 1);
console.log('OK plantilla ->', r1.banks.map((b) => b.label + '(' + b.questions.length + ')').join(', '));

// 2) Excel en inglés: comas, sin BOM, y encabezados con acentos y mayúsculas.
const coma = 'Categoría,Tema,Pregunta,A,B,C,D,Correcta,Distractor,Porqué\n' +
  'Ciencias,El cuerpo,"¿Cuántos huesos tiene la mano, más o menos?",27,15,206,5,A,B,"La mano tiene 27 huesos."\n';
const r2 = parseCsv(coma);
assert.equal(r2.ok, 1, 'lee comas y acentos en el encabezado');
assert.equal(r2.banks[0].questions[0].text.includes('mano, más'), true, 'respeta la coma dentro de comillas');
assert.equal(r2.banks[0].cat, 'Ciencias');
console.log('OK comas + acentos + coma dentro del texto');

// 3) Filas malas: se reportan pero NO tumban el archivo.
const sucio = 'tema;pregunta;A;B;C;D;correcta\n' +
  'Bien;Pregunta buena;1;2;3;4;A\n' +
  'Mal;Sin correcta valida;1;2;3;4;Z\n' +
  ';Sin tema;1;2;3;4;A\n' +
  'Mal2;Solo una opcion;1;;;;A\n' +
  'Bien;Otra buena;5;6;7;8;B\n';
const r3 = parseCsv(sucio);
assert.equal(r3.ok, 2, 'importa las 2 buenas');
assert.equal(r3.errors.length, 3, 'y reporta las 3 malas');
console.log('OK filas malas ->', r3.errors.length, 'avisos, ' + r3.ok + ' preguntas salvadas');

// 4) Archivo vacío o basura no revienta.
assert.equal(parseCsv('').ok, 0);
assert.equal(parseCsv('hola mundo').ok, 0);
console.log('OK archivo vacio / basura');
console.log('\nTodos los chequeos de CSV pasaron');
