// Bancos de preguntas: leerlos del disco e importarlos desde el CSV que la
// maestra exporta de Excel.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export const LETTERS = ['A', 'B', 'C', 'D'];

const stripAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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

// Formato del archivo, una fila por pregunta y sin encabezado obligatorio:
//   número ; pregunta ; respuesta correcta ; respuesta 2 ; respuesta 3 ; respuesta 4
// La PRIMERA respuesta es la correcta; al importar se barajan para que no
// siempre caiga en A. Las cuatro vacías = pregunta abierta: el alumno escribe.
// Un archivo = un tema, con el nombre del archivo.
const shuffle = (a) => {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Devuelve { banks, ok, errors }. Una fila mala NO tumba el archivo entero:
// si la maestra sube 40 preguntas y una tiene un typo, se importan las 39.
export function parseCsv(text, tema) {
  const label = String(tema ?? '').trim().slice(0, 40) || 'Mis preguntas';
  const errors = [];
  let rows;
  try {
    rows = parse(text, {
      bom: true,
      delimiter: sniffDelimiter(text.replace(/^\uFEFF/, '')),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch (e) {
    return { banks: [], ok: 0, errors: ['No pude leer el archivo: ' + e.message] };
  }

  const questions = [];
  rows.forEach((r, i) => {
    const line = i + 1;
    const [num = '', text_ = '', ...rest] = r;
    if (i === 0 && !/^\d+$/.test(num)) return;   // encabezado: se salta
    const answers = rest.slice(0, 4).filter(Boolean);
    if (!text_) {
      if (answers.length) errors.push('Fila ' + line + ': falta la pregunta.');
      return;                                    // fila en blanco
    }
    if (answers.length === 1) {
      return errors.push('Fila ' + line + ': una sola respuesta. Poné de 2 a 4 (la primera es la correcta) o dejá las cuatro vacías para que sea abierta.');
    }
    if (!answers.length) return questions.push({ text: text_, open: true });

    const idx = shuffle([...answers.keys()]);
    const opts = {};
    idx.forEach((src, k) => { opts[LETTERS[k]] = answers[src]; });
    questions.push({ text: text_, opts, correct: LETTERS[idx.indexOf(0)] });
  });

  if (!questions.length) return { banks: [], ok: 0, errors };
  const bank = {
    id: slug(label),
    label,
    cat: 'General',
    grade: 'todos',
    glyph: label.charAt(0).toUpperCase(),
    order: 1000,                 // después de los bancos que trae TutorBox
    questions,
  };
  return { banks: [bank], ok: questions.length, errors };
}

// Plantilla con BOM y ';' : así Excel en español la abre en columnas y con acentos.
export function templateCsv() {
  const rows = [
    ['N', 'Pregunta', 'Respuesta correcta', 'Respuesta 2', 'Respuesta 3', 'Respuesta 4'],
    ['1', '¿Cuánto es 24 + 18?', '42', '32', '41', '46'],
    ['2', '¿Cuánto es 50 - 27?', '23', '33', '27', '17'],
    ['3', '¿Cuál palabra lleva tilde?', 'árbol', 'papel', 'reloj', ''],
    // Las cuatro respuestas vacías: el alumno escribe la suya en el celular.
    ['4', 'Escribí con tus palabras qué aprendiste hoy.', '', '', '', ''],
  ];
  const esc = (v) => (/[";\r\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  return '\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
