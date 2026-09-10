// Genera banks/*.json con los cuatro temas del diseño.
// Se corre una vez (npm run seed-banks); los JSON quedan versionados.
// La maestra puede reemplazarlos subiendo su propio CSV.
import { saveBanks } from '../lib/bank.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'banks');
const LETTERS = ['A', 'B', 'C', 'D'];

// Reparte 4 valores en A-D de forma estable (semilla = el enunciado) para que
// la respuesta correcta no caiga siempre en la misma letra.
function place(text, correctVal, distVal, others) {
  const vals = [correctVal, distVal, ...others].map(String);
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
  for (let i = vals.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [vals[i], vals[j]] = [vals[j], vals[i]];
  }
  const opts = {};
  vals.forEach((v, i) => { opts[LETTERS[i]] = v; });
  return {
    opts,
    correct: LETTERS[vals.indexOf(String(correctVal))],
    dist: LETTERS[vals.indexOf(String(distVal))],
  };
}

function q(text, correct, dist, others, why, err) {
  return Object.assign({ text }, place(text, correct, dist, others), { why, err });
}


// Dos opciones de relleno, garantizadas distintas entre sí y de las otras dos.
// (El chequeo del final atrapó 81 - 26, donde r+10 chocaba con el distractor.)
function others(correct, dist) {
  const used = new Set([String(correct), String(dist)]);
  const out = [];
  for (const d of [10, -10, 1, -1, 9, -9, 2, -2, 20, -20, 11, 3]) {
    const v = correct + d;
    if (v > 0 && !used.has(String(v))) { used.add(String(v)); out.push(v); }
    if (out.length === 2) break;
  }
  return out;
}
// --- sumas y restas ---------------------------------------------------
const SUMAS = [];

// Suma llevando: el error clásico es no llevar la decena.
for (const [a, b] of [[24, 18], [37, 25], [46, 29], [58, 17], [35, 48], [29, 33], [47, 26], [56, 38], [18, 64], [27, 55]]) {
  const r = a + b;
  const u = (a % 10) + (b % 10);
  const sinLlevar = (Math.floor(a / 10) + Math.floor(b / 10)) * 10 + (u % 10);
  SUMAS.push(q(
    '¿Cuánto es ' + a + ' + ' + b + '?',
    r, sinLlevar, others(r, sinLlevar),
    'Al sumar las unidades ' + (a % 10) + ' + ' + (b % 10) + ' obtenemos ' + u + ': se escribe el ' + (u % 10) + ' y se lleva 1 a las decenas.',
    'eligieron ' + sinLlevar + ': olvidaron llevar la decena.',
  ));
}

// Resta prestando: el error clásico es restar el dígito chico del grande.
for (const [a, b] of [[50, 27], [62, 35], [74, 48], [43, 19], [81, 26], [95, 37], [60, 24], [52, 28]]) {
  const r = a - b;
  const sinPrestar = Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));
  SUMAS.push(q(
    '¿Cuánto es ' + a + ' − ' + b + '?',
    r, sinPrestar, others(r, sinPrestar),
    'Como ' + (a % 10) + ' es menor que ' + (b % 10) + ', hay que pedir prestado a la decena antes de restar.',
    'eligieron ' + sinPrestar + ': restaron el dígito menor del mayor sin pedir prestado.',
  ));
}

// Problemas con palabras: el error clásico es sumar cuando toca restar.
for (const [nombre, obj, a, b] of [['Ana', 'canicas', 15, 6], ['Luis', 'lápices', 21, 8], ['María', 'naranjas', 30, 12],
  ['Pedro', 'stickers', 18, 9], ['Sofía', 'galletas', 24, 7], ['Juan', 'quetzales', 40, 15]]) {
  SUMAS.push(q(
    nombre + ' tiene ' + a + ' ' + obj + ' y regala ' + b + '. ¿Cuántas le quedan?',
    a - b, a + b, others(a - b, a + b),
    'Regalar significa quitar: ' + a + ' − ' + b + ' = ' + (a - b) + '.',
    'eligieron ' + (a + b) + ': sumaron en lugar de restar.',
  ));
}

// --- multiplicación ---------------------------------------------------
const MULTI = [];
for (const [a, b] of [[7, 8], [6, 9], [8, 4], [9, 7], [6, 7], [8, 8], [5, 9], [7, 6], [9, 9], [4, 7], [8, 6], [9, 4]]) {
  const r = a * b;
  const corta = a * (b - 1);      // se quedaron una vez corta en la tabla
  MULTI.push(q(
    '¿Cuánto es ' + a + ' × ' + b + '?',
    r, corta, others(r, corta),
    'Multiplicar ' + a + ' × ' + b + ' es sumar ' + a + ' un total de ' + b + ' veces: da ' + r + '.',
    'eligieron ' + corta + ': se quedaron una vez corta en la tabla del ' + a + '.',
  ));
}
for (const [nombre, obj, cajas, cada] of [['Rosa', 'huevos', 6, 12], ['Carlos', 'sillas', 5, 8],
  ['La maestra', 'cuadernos', 7, 4], ['Elena', 'panes', 9, 6], ['Diego', 'canicas', 8, 5], ['Ixchel', 'flores', 4, 9]]) {
  MULTI.push(q(
    nombre + ' tiene ' + cajas + ' cajas con ' + cada + ' ' + obj + ' cada una. ¿Cuántos hay en total?',
    cajas * cada, cajas + cada, others(cajas * cada, cajas + cada),
    'Hay ' + cajas + ' grupos iguales de ' + cada + ': se multiplica ' + cajas + ' × ' + cada + ' = ' + (cajas * cada) + '.',
    'eligieron ' + (cajas + cada) + ': sumaron en lugar de multiplicar.',
  ));
}

// --- fracciones -------------------------------------------------------
const FRAC = [
  q('¿Cuál fracción es mayor: 1/2 o 1/4?', '1/2', '1/4', ['Son iguales', 'No se puede saber'],
    'Al partir un pan en 2 pedazos, cada pedazo es más grande que si lo partimos en 4.',
    'eligieron 1/4: creyeron que el número de abajo más grande significa fracción más grande.'),
  q('¿Cuál fracción es mayor: 1/3 o 1/5?', '1/3', '1/5', ['Son iguales', '2/5'],
    'Entre menos pedazos, más grande es cada pedazo: un tercio es mayor que un quinto.',
    'eligieron 1/5: creyeron que el número de abajo más grande significa fracción más grande.'),
  q('¿Cuánto es 1/5 + 2/5?', '3/5', '3/10', ['2/5', '1/5'],
    'Cuando el número de abajo es igual, solo se suman los de arriba: 1 + 2 = 3, y queda 3/5.',
    'eligieron 3/10: sumaron también los números de abajo.'),
  q('¿Cuánto es 2/7 + 3/7?', '5/7', '5/14', ['6/7', '2/7'],
    'El denominador no cambia al sumar: 2 + 3 = 5, entonces 5/7.',
    'eligieron 5/14: sumaron también los números de abajo.'),
  q('¿Cuánto es 3/8 + 2/8?', '5/8', '5/16', ['6/8', '1/8'],
    'Los octavos se suman entre sí: 3 + 2 = 5, y queda 5/8.',
    'eligieron 5/16: sumaron también los números de abajo.'),
  q('¿Cuál es la mitad de 20?', '10', '40', ['5', '15'],
    'La mitad es partir en dos partes iguales: 20 ÷ 2 = 10.',
    'eligieron 40: multiplicaron por 2 en lugar de dividir.'),
  q('¿Cuál es la mitad de 36?', '18', '72', ['16', '12'],
    'Partimos 36 en dos partes iguales: 36 ÷ 2 = 18.',
    'eligieron 72: multiplicaron por 2 en lugar de dividir.'),
  q('¿Cuál es la cuarta parte de 20?', '5', '80', ['4', '10'],
    'La cuarta parte es dividir entre 4: 20 ÷ 4 = 5.',
    'eligieron 80: multiplicaron por 4 en lugar de dividir.'),
  q('¿Cuál es la tercera parte de 27?', '9', '81', ['3', '13'],
    'La tercera parte es dividir entre 3: 27 ÷ 3 = 9.',
    'eligieron 81: multiplicaron por 3 en lugar de dividir.'),
  q('¿Qué fracción es igual a 1/2?', '2/4', '1/4', ['2/3', '3/4'],
    'Si partimos el mismo pan en 4 y tomamos 2 pedazos, es lo mismo que la mitad.',
    'eligieron 1/4: es la mitad de la mitad, no la mitad.'),
  q('¿Qué fracción es igual a 1/3?', '2/6', '1/6', ['3/6', '2/3'],
    'Multiplicando arriba y abajo por 2: 1/3 = 2/6.',
    'eligieron 1/6: solo multiplicaron el número de abajo.'),
  q('Un pastel se parte en 8 y se comen 3. ¿Qué fracción queda?', '5/8', '3/8', ['8/5', '5/3'],
    'Quedan 8 − 3 = 5 pedazos de los 8: eso es 5/8.',
    'eligieron 3/8: dijeron la parte que se comieron, no la que quedó.'),
  q('Si 1/4 de un grupo son 5 niños, ¿cuántos son en total?', '20', '9', ['15', '25'],
    'Si una cuarta parte son 5, el total es 5 × 4 = 20.',
    'eligieron 9: sumaron 5 + 4 en lugar de multiplicar.'),
  q('¿Cuánto es 3/4 de 12?', '9', '4', ['3', '16'],
    'Una cuarta parte de 12 es 3; tres cuartas partes son 3 × 3 = 9.',
    'eligieron 4: se quedaron en una sola cuarta parte.'),
  q('¿Cuál fracción representa medio litro?', '1/2', '4/2', ['1/4', '2/3'],
    'Medio es una parte de dos: se escribe 1/2, con el 1 arriba.',
    'eligieron 4/2: eso es más de un litro entero.'),
  q('¿Cuál es mayor: 3/4 o 1/2?', '3/4', '1/2', ['Son iguales', '1/4'],
    'La mitad son 2/4; tres cuartos es un pedazo más, así que es mayor.',
    'eligieron 1/2: compararon solo los números de arriba.'),
];

// --- geometría --------------------------------------------------------
const GEO = [
  q('¿Cuántos lados tiene un triángulo?', '3', '4', ['5', '6'],
    'Tri quiere decir tres: tres lados y tres esquinas.',
    'eligieron 4: confundieron el triángulo con el cuadrado.'),
  q('¿Cuántos lados tiene un pentágono?', '5', '6', ['4', '8'],
    'Penta quiere decir cinco, como en la palabra pentagrama.',
    'eligieron 6: ese sería el hexágono.'),
  q('¿Cuántos lados tiene un hexágono?', '6', '5', ['7', '8'],
    'Hexa quiere decir seis, como el panal de las abejas.',
    'eligieron 5: ese sería el pentágono.'),
  q('¿Cuántos lados tiene un octágono?', '8', '6', ['7', '10'],
    'Octa quiere decir ocho, como el pulpo con sus ocho brazos.',
    'eligieron 6: ese sería el hexágono.'),
  q('¿Cuál es el perímetro de un cuadrado de lado 5 cm?', '20 cm', '25 cm', ['10 cm', '15 cm'],
    'El perímetro es el borde: se suman los 4 lados, 5 × 4 = 20 cm.',
    'eligieron 25 cm: calcularon el área (5 × 5) en lugar del borde.'),
  q('¿Cuál es el área de un cuadrado de lado 5 cm?', '25 cm²', '20 cm²', ['10 cm²', '30 cm²'],
    'El área es lo que cabe adentro: lado por lado, 5 × 5 = 25 cm².',
    'eligieron 20 cm²: calcularon el perímetro en lugar del área.'),
  q('¿Cuál es el perímetro de un rectángulo de 6 cm por 4 cm?', '20 cm', '24 cm', ['10 cm', '12 cm'],
    'Se suman los cuatro lados: 6 + 4 + 6 + 4 = 20 cm.',
    'eligieron 24 cm: calcularon el área (6 × 4) en lugar del borde.'),
  q('¿Cuál es el área de un rectángulo de 6 cm por 4 cm?', '24 cm²', '20 cm²', ['10 cm²', '12 cm²'],
    'El área es base por altura: 6 × 4 = 24 cm².',
    'eligieron 20 cm²: calcularon el perímetro en lugar del área.'),
  q('¿Cómo se llama el ángulo que mide 90°?', 'Recto', 'Agudo', ['Obtuso', 'Llano'],
    'El ángulo recto es la esquina de una hoja o de una puerta: mide 90°.',
    'eligieron Agudo: el agudo es el que mide menos de 90°.'),
  q('¿Cómo se llama el ángulo que mide menos de 90°?', 'Agudo', 'Obtuso', ['Recto', 'Llano'],
    'Agudo es puntiagudo: más cerrado que la esquina de una hoja.',
    'eligieron Obtuso: el obtuso es el más abierto, mide más de 90°.'),
  q('¿Cómo se llama el triángulo con sus tres lados iguales?', 'Equilátero', 'Isósceles', ['Escaleno', 'Rectángulo'],
    'Equi quiere decir igual: los tres lados miden lo mismo.',
    'eligieron Isósceles: ese tiene solo dos lados iguales.'),
  q('¿Cuántas caras tiene un cubo?', '6', '8', ['4', '12'],
    'Un dado es un cubo: tiene 6 caras, del 1 al 6.',
    'eligieron 8: contaron las esquinas, no las caras.'),
  q('¿Qué figura tiene todos sus puntos a la misma distancia del centro?', 'Círculo', 'Cuadrado', ['Triángulo', 'Rombo'],
    'Esa distancia igual se llama radio, y es lo que hace redondo al círculo.',
    'eligieron Cuadrado: el cuadrado tiene esquinas, no distancia pareja.'),
  q('¿En qué se diferencia el rectángulo del cuadrado?', 'Sus lados son iguales de dos en dos', 'Sus cuatro lados son iguales', ['No tiene ángulos rectos', 'Tiene solo 3 lados'],
    'Los dos tienen las cuatro esquinas rectas, pero en el rectángulo los lados largos y los cortos son distintos.',
    'eligieron que sus cuatro lados son iguales: eso describe al cuadrado.'),
];

const banks = [
  { order: 1, id: 'sumas', label: 'Sumas y restas', cat: 'Matemáticas', grade: '1.º–3.º', glyph: '+', questions: SUMAS },
  { order: 2, id: 'multiplicacion', label: 'Multiplicación', cat: 'Matemáticas', grade: '3.º–4.º', glyph: '×', questions: MULTI },
  { order: 3, id: 'fracciones', label: 'Fracciones', cat: 'Matemáticas', grade: '4.º–5.º', glyph: '½', questions: FRAC },
  { order: 4, id: 'geometria', label: 'Geometría', cat: 'Figuras', grade: '4.º–6.º', glyph: '◺', questions: GEO },
];

// Chequeo: cuatro opciones distintas, correcta y distractor válidos y diferentes.
let bad = 0;
for (const b of banks) {
  for (const item of b.questions) {
    const vals = Object.values(item.opts);
    const ok = new Set(vals).size === vals.length
      && item.opts[item.correct] !== undefined
      && item.opts[item.dist] !== undefined
      && item.correct !== item.dist;
    if (!ok) { bad += 1; console.error('MAL:', b.id, JSON.stringify(item)); }
  }
}
if (bad) { console.error(bad + ' preguntas inválidas'); process.exit(1); }

saveBanks(OUT, banks);
console.log(banks.map((b) => b.id + ': ' + b.questions.length).join('  ·  '));
