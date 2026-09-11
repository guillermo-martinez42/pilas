// Si la maestra olvidó su PIN: borra el PIN y las sesiones. En Render alcanza
// con cambiar TEACHER_PIN y redesplegar.
import { openDb } from '../lib/db.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = openDb(join(HERE, '..', 'data', 'pilas.db'));

if (!db.teacher()) {
  console.log('No hay ningún PIN guardado. Abrí /maestra y creá uno.');
} else {
  db.clearTeacher();
  console.log('PIN borrado y sesiones cerradas.');
  console.log('Ahora abrí /maestra y creá uno nuevo.');
}
