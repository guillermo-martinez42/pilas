import { templateCsv, parseCsv } from './lib/bank.js';
import assert from 'node:assert/strict';

// 1) Ida y vuelta con la plantilla que baja la maestra (BOM + ';' + encabezado).
const r1 = parseCsv(templateCsv(), 'Repaso');
assert.equal(r1.errors.length, 0, 'sin errores: ' + r1.errors.join(' | '));
assert.equal(r1.ok, 4, 'las 4 filas de ejemplo se leen (el encabezado se salta)');
assert.equal(r1.banks.length, 1, 'un archivo = un tema');
const b = r1.banks[0];
assert.equal(b.label, 'Repaso');
assert.equal(b.id, 'repaso');

// La primera respuesta es la correcta, aunque quede barajada en otra letra.
const q1 = b.questions[0];
assert.equal(Object.keys(q1.opts).length, 4);
assert.equal(q1.opts[q1.correct], '42', 'la correcta es la primera del archivo');
assert.deepEqual(b.questions.map((q) => q.seconds), [20, 30, 15, 90], 'la columna 2 son los segundos');
assert.equal(new Set(Object.values(q1.opts)).size, 4, 'las cuatro respuestas están, sin repetir');
assert.equal(Object.keys(b.questions[2].opts).join(''), 'ABC', 'tres respuestas -> A, B y C');

// Las cuatro vacías = abierta: sin opciones ni letra correcta.
const libre = b.questions[3];
assert.equal(libre.open, true);
assert.equal(libre.opts, undefined);
assert.equal(libre.correct, undefined);
console.log('OK plantilla ->', b.label + '(' + b.questions.length + ')');

// 2) Excel en inglés: comas, sin BOM ni encabezado, coma dentro de comillas.
const coma = '1,,"¿Cuántos huesos tiene la mano, más o menos?",27,15,206\n2,abc,Contá algo,,,,\n';
const r2 = parseCsv(coma, 'El cuerpo.csv');
assert.equal(r2.ok, 2, 'lee comas sin encabezado');
assert.equal(r2.banks[0].questions[0].text.includes('mano, más'), true, 'respeta la coma dentro de comillas');
assert.equal(r2.banks[0].questions[1].open, true);
assert.deepEqual(r2.banks[0].questions.map((q) => q.seconds), [20, 20], 'segundos vacíos o basura -> 20');
console.log('OK comas + sin encabezado');

// 2b) Excel guardó ';' adentro y una cola de comas afuera (caso real de la maestra).
const cola = '﻿N;Pregunta;Respuesta correcta;Respuesta 2;Respuesta 3;Respuesta 4,,,,,,,,\r\n' +
  '1;60;¿Quién fue Marco Aurelio?;Emperador y filósofo estoico;Un general cartaginés;Un orador;,,,,,,,,\r\n' +
  '2;120;Explicá la dicotomía del control.;;;;,,,,,,,,\r\n';
const r2b = parseCsv(cola, 'Estoicos');
assert.equal(r2b.ok, 2, 'la cola de comas no rompe el archivo: ' + r2b.errors.join(' | '));
assert.equal(Object.keys(r2b.banks[0].questions[0].opts).length, 3, 'tres respuestas, sin comas pegadas');
assert.equal(r2b.banks[0].questions[0].opts[r2b.banks[0].questions[0].correct], 'Emperador y filósofo estoico');
assert.equal(r2b.banks[0].questions[1].open, true, 'la fila sin respuestas queda abierta');
console.log('OK cola de comas de Excel');

// 3) Filas malas: se reportan pero NO tumban el archivo.
const sucio = '1;20;Pregunta buena;1;2;3;4\n' +
  '2;20;Una sola respuesta;1;;;\n' +
  '3;20;;1;2;3;4\n' +
  ';;;;;;\n' +
  '4;20;Otra buena;5;6\n';
const r3 = parseCsv(sucio, 'Mixto');
assert.equal(r3.ok, 2, 'importa las 2 buenas');
assert.equal(r3.errors.length, 2, 'reporta la de una respuesta y la sin pregunta; la vacía se ignora');
console.log('OK filas malas ->', r3.errors.length, 'avisos, ' + r3.ok + ' preguntas salvadas');

// 4) Sin nombre de tema, archivo vacío o basura: no revienta.
assert.equal(parseCsv('1;10;Hola;a;b\n').banks[0].label, 'Mis preguntas');
assert.equal(parseCsv('', 'X').ok, 0);
assert.equal(parseCsv('hola mundo', 'X').ok, 0, 'una sola fila sin número es encabezado');
console.log('OK archivo vacio / basura');
console.log('\nTodos los chequeos de CSV pasaron');
