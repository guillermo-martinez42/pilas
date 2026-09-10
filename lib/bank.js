// Bancos de preguntas: leerlos del disco e importarlos desde el CSV que la
// maestra exporta de Excel.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export const LETTERS = ['A', 'B', 'C', 'D'];

const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => stripAccents(s).toLowerCase().trim().replace(/[\s.]+/g, '_');

export const slug = (s) => stripAccents(s)
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 40) || 'tema';

export function loadBanks(dir) {
  mkdirSync(dir, { recursive: true });
  const banks = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (b?.id && Array.isArray(b.questions) && b.questions.length) banks.push(b);
    } catch (e) {
      console.error('Banco ilegible, lo salto:', f, e.message);
    }
  }
  // Orden pedagógico (el que trae cada banco), no alfabético.
  return banks.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.label.localeCompare(b.label, 'es'));
}

export function saveBanks(dir, banks) {
  mkdirSync(dir, { recursive: true });
  for (const b of banks) writeFileSync(join(dir, b.id + '.json'), JSON.stringify(b, null, 2) + '\n', 'utf8');
}

// Excel en español exporta con ';'; en inglés con ','. Miramos el encabezado.
function sniffDelimiter(text) {
  const head = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of head) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

const HEADERS = {
  categoria: 'cat', category: 'cat',
  tema: 'tema', topic: 'tema',
  grado: 'grade', grade: 'grade',
  simbolo: 'glyph',
  pregunta: 'text', question: 'text',
  a: 'A', b: 'B', c: 'C', d: 'D',
  correcta: 'correct', correcto: 'correct', correct: 'correct',
  distractor: 'dist',
  porque: 'why', explicacion: 'why', por_que: 'why',
  error: 'err',
  audio_es: 'audio_es', audio_quc: 'audio_quc',
};

// Devuelve { banks, ok, errors }. Una fila mala NO tumba el archivo entero:
// si la maestra sube 40 preguntas y una tiene un typo, se importan las 39.
export function parseCsv(text) {
  const errors = [];
  let rows;
  try {
    rows = parse(text, {
      bom: true,
      columns: (header) => header.map((h) => HEADERS[norm(h)] ?? norm(h)),
      delimiter: sniffDelimiter(text.replace(/^\uFEFF/, '')),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (e) {
    return { banks: [], ok: 0, errors: ['No pude leer el archivo: ' + e.message] };
  }

  const byId = new Map();
  let ok = 0;

  rows.forEach((r, i) => {
    const line = i + 2;                       // +1 encabezado, +1 base 1
    const tema = (r.tema ?? '').trim();
    const text_ = (r.text ?? '').trim();
    if (!tema && !text_) return;              // fila vacía
    if (!tema) return errors.push('Fila ' + line + ': falta el tema.');
    if (!text_) return errors.push('Fila ' + line + ': falta la pregunta.');

    const correct = (r.correct ?? '').trim().toUpperCase();
    // "correcta: abierta" = el alumno escribe la respuesta; no hay A-D ni puntaje.
    const abierta = ['ABIERTA', 'LIBRE', 'OPEN'].includes(stripAccents(correct));

    const opts = {};
    for (const L of LETTERS) {
      const v = (r[L] ?? '').trim();
      if (v) opts[L] = v;
    }
    let dist = '';
    if (!abierta) {
      if (Object.keys(opts).length < 2) return errors.push('Fila ' + line + ': se necesitan al menos dos opciones (A y B), o poné "abierta" en la columna correcta.');
      if (!opts[correct]) return errors.push('Fila ' + line + ': "correcta" debe ser una letra con opción llena (A, B, C o D) o la palabra "abierta".');
      dist = (r.dist ?? '').trim().toUpperCase();
      if (dist && (!opts[dist] || dist === correct)) {
        errors.push('Fila ' + line + ': ignoré el distractor (debe ser otra letra con opción llena).');
        dist = '';
      }
    }

    const id = slug(tema);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: tema,
        cat: (r.cat ?? 'General').trim() || 'General',
        grade: (r.grade ?? '').trim() || 'todos',
        glyph: (r.glyph ?? '').trim() || tema.trim().charAt(0).toUpperCase(),
        order: 1000 + byId.size,   // los temas de la maestra guardan el orden del archivo
        questions: [],
      });
    }
    const q = abierta ? { text: text_, open: true } : { text: text_, opts, correct };
    if (dist) q.dist = dist;
    if ((r.why ?? '').trim()) q.why = r.why.trim();
    if ((r.err ?? '').trim()) q.err = r.err.trim();
    if ((r.audio_es ?? '').trim()) q.audio_es = r.audio_es.trim();
    if ((r.audio_quc ?? '').trim()) q.audio_quc = r.audio_quc.trim();
    byId.get(id).questions.push(q);
    ok += 1;
  });

  return { banks: [...byId.values()], ok, errors };
}

// Plantilla con BOM y ';' : así Excel en español la abre en columnas y con acentos.
export function templateCsv() {
  const head = ['categoria', 'tema', 'grado', 'simbolo', 'pregunta', 'A', 'B', 'C', 'D', 'correcta', 'distractor', 'porque', 'error'];
  const rows = [
    ['Matematicas', 'Sumas y restas', '1.o-3.o', '+', 'Cuanto es 24 + 18?', '32', '42', '41', '46', 'B', 'C',
      'Al sumar 4 + 8 obtenemos 12: se escribe el 2 y se lleva 1 a las decenas.', 'eligieron 41: olvidaron llevar la decena.'],
    ['Matematicas', 'Sumas y restas', '1.o-3.o', '+', 'Cuanto es 50 - 27?', '23', '33', '27', '17', 'A', 'B',
      'Hay que pedir prestado a la decena: 50 se convierte en 40 y 10.', 'eligieron 33: no pidieron prestado a la decena.'],
    ['Lenguaje', 'Ortografia', '3.o-4.o', 'A', 'Cual palabra lleva tilde?', 'arbol', 'arbol sin tilde', 'papel', 'reloj', 'A', '',
      'Las palabras graves que no terminan en n, s o vocal llevan tilde.', ''],
    // Respuesta abierta: se deja A-D vacias y en "correcta" se escribe abierta.
    ['Lenguaje', 'Escritura', '3.o-4.o', 'E', 'Escribi con tus palabras que aprendiste hoy.', '', '', '', '', 'abierta', '',
      'Cada alumno escribe su respuesta en el celular. No da puntos: la maestra las lee en el CSV de respuestas.', ''],
  ];
  const esc = (v) => (/[";\r\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return '\uFEFF' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
