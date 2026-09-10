// Si la maestra olvidó su PIN. Sólo se puede correr en la máquina del
// TutorBox: acceso físico a la caja = poder resetear. No hace falta correo
// (que además necesitaría internet).
import { openDb } from '../lib/db.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const db = openDb(join(HERE, '..', 'data', 'tutorbox.db'));

if (!db.teacher()) {
  console.log('No hay ningún PIN guardado. Abrí /maestra y creá uno.');
} else {
  db.clearTeacher();
  console.log('PIN borrado y sesiones cerradas.');
  console.log('Ahora abrí http://<la-dirección-del-TutorBox>/maestra y creá uno nuevo.');
}
