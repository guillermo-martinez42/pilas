# Pilas

Cuestionarios en vivo para el aula. Vive en **https://pilas-9t85.onrender.com**.

- **Pantalla del aula** (proyector) — la pregunta, el tiempo y el código QR.
- **Teléfono de la maestra** — elige el tema, ve quién contestó, avanza.
- **Celular de cada alumno** — responde A, B, C o D.

---

## El día a día

1. Abrís [`/pantalla`](https://pilas-9t85.onrender.com/pantalla) en la computadora del proyector: muestra el **código QR**.
2. Los alumnos escanean el QR con la cámara y escriben su nombre.
3. Abrís [`/maestra`](https://pilas-9t85.onrender.com/maestra) en tu teléfono, ponés tu PIN y seguís los tres pasos:
   **crear o subir el cuestionario → quiénes están listos → comenzar**.
   Se juegan todas las preguntas, en el orden en que las escribiste.
4. Cada pregunta dura los segundos que le pusiste, pero vos decidís cuándo pasar a la siguiente.
5. Al final: promedio del grupo, clasificación y preguntas más difíciles. El botón
   *Guardar reporte del grupo* baja un Excel.

Mientras juegan, en tu teléfono ves **qué contestó cada alumno en vivo**. Eso no
se proyecta: en la pared solo salen la pregunta y el tiempo.


---

## Cómo entran los alumnos

El QR de la pantalla ya lleva el código de sala adentro: escanear es un paso, no dos.
Quien prefiera teclear, entra a la dirección que aparece junto al QR y escribe el
código de 4 números.

---

## Tu PIN

El PIN de 6 números es el que está en la variable `TEACHER_PIN` de Render.
Ese PIN es solo tuyo: los alumnos nunca lo ven, y el código de sala que sí ven
no sirve para entrar como maestra.

- Después de ponerlo una vez, **ese teléfono queda recordado** y no te lo vuelve
  a pedir.
- A los 5 intentos fallidos se bloquea un minuto, para que nadie lo adivine.
- **Si lo olvidás:** cambiá `TEACHER_PIN` en Render y redesplegá.

---

## Tus cuestionarios

Pilas no trae preguntas: los cuestionarios son tuyos. En el paso 1 hay dos botones.

### Crear mi cuestionario (en el teléfono)

Le ponés nombre y decís cuántas preguntas tiene. Después, una pantalla por
pregunta: el enunciado, **la respuesta correcta**, hasta tres respuestas más y,
junto al relojito ⏱, **cuántos segundos dura**. *Siguiente* hasta la última y
*Guardar cuestionario*. Queda cargado para jugar.

### Subir plantilla CSV (desde Excel)

*Bajá la plantilla*, borrá los ejemplos, escribí tus preguntas y guardá como CSV
**con el nombre del cuestionario** (`Fracciones.csv` → cuestionario *Fracciones*).
Una fila por pregunta, siete columnas, sin nada más:

| Columna | Qué va |
|:--|:--|
| 1 | El número de la pregunta (1, 2, 3…) |
| 2 | **Segundos** que dura (vacío = 20) |
| 3 | La pregunta |
| 4 | **La respuesta correcta** |
| 5, 6, 7 | Las otras respuestas (podés dejar una o dos vacías) |

```
1;20;¿Cuánto es 24 + 18?;42;32;41;46
2;15;¿Cuál palabra lleva tilde?;árbol;papel;reloj;
3;90;Escribí con tus palabras qué aprendiste hoy.;;;;
```

La correcta siempre va en la columna 4: Pilas las baraja al importar, así no
cae siempre en la A. Si la primera fila es un encabezado, se salta sola; si Excel
deja una cola de comas al final de cada línea, también.

### Preguntas de respuesta abierta

Dejá **las cuatro respuestas vacías** (fila 3 del ejemplo, o los cuatro campos en
blanco al crear). En el celular aparece una caja de texto (hasta 200 letras) en vez
de las opciones. Mientras contestan, vos ves en tu panel quién ya escribió y **qué
escribió cada uno**. Estas preguntas **no dan puntos** — no hay respuesta correcta
que comparar — así que no entran en el promedio ni en la clasificación. Al terminar
el juego, el botón *Descargar respuestas escritas* baja un CSV con una fila por
alumno y pregunta.

Si una fila tiene un problema (una sola respuesta, sin pregunta), **se importan
todas las demás** y te dice cuáles saltó. No perdés 40 preguntas por un typo.

El último cuestionario creado o subido queda cargado hasta que subas otro. Se
guarda en `banks/` del servidor; en Render (plan gratis) esa carpeta se borra con
cada deploy, así que guardá tu CSV.

---

## Probarlo en tu máquina

Necesita **Node 22.5 o más nuevo** (SQLite viene adentro de Node).

```bash
npm install
PUBLIC_URL= npm start   # PUBLIC_URL vacía = QR con la IP de tu red local
```

La consola imprime las tres direcciones. Para forzar una IP: `HOST_IP=192.168.1.50 PUBLIC_URL= npm start`.

```bash
npm test           # chequeos del núcleo y del importador de CSV
```

---

## Si algo falla

| Pasa esto | Es por esto |
|:--|:--|
| La pantalla tarda un minuto en abrir | Render (plan gratis) se durmió. Abrí `/pantalla` unos minutos antes de la clase. |
| Olvidaste el PIN | Cambiá `TEACHER_PIN` en Render y redesplegá. |
| Probando en local, la dirección sale rara (26.x, 172.x) | La máquina tiene una VPN o red virtual. Arrancá con `HOST_IP=` y la dirección buena. |

Ver qué está pasando: los logs del servicio en Render.

---

## La voz y el aviso de "error repetido"

Quedan en el código pero **apagados**: sólo funcionan con bancos JSON que traigan
los campos `dist`, `why`, `err` y `audio_es` / `audio_quc`, y los cuestionarios que
se crean o suben no los tienen. Si algún día hacen falta, es cuestión de sumar esas
columnas al importador.

## Notas técnicas

- **Sin paso de build.** HTML, CSS y módulos ES servidos tal cual. Se edita un
  archivo y se recarga: nada que compilar el día de la clase.
- **Tres dependencias** (`express`, `qrcode`, `csv-parse`). La base de datos es
  el `node:sqlite` que ya trae Node.
- **SSE, no WebSocket.** `EventSource` se reconecta solo cuando la red parpadea,
  y no necesita librería.
- **El servidor manda.** El paso, el cronómetro y la validación de respuestas
  viven en el servidor. La respuesta correcta **no se manda al celular del alumno
  ni al proyector** hasta que la maestra revela: si no, se lee en la pestaña de
  red del navegador.
- Las tipografías están **auto-hospedadas** en `public/fonts/`.

## Desplegar (Render, gratis)

No puede ser un sitio estático: las tres pantallas comparten una partida en vivo
que vive en el servidor. Corre gratis en Render.

1. Subí el repo a GitHub (privado está bien; `data/` no se sube).
2. En [render.com](https://render.com): **New → Web Service**, conectá el repo.
   Language *Node*, Build `npm ci`, Start `npm start`, Instance Type **Free**,
   región *Ohio* o *Virginia*. La versión de Node la toma de `.node-version`.
3. Variables de entorno:

   | Variable | Qué va |
   |:--|:--|
   | `PUBLIC_URL` | `https://pilas-9t85.onrender.com` — es lo que lleva el QR (ya es el valor por defecto) |
   | `TEACHER_PIN` | seis dígitos. El disco de Render se borra en cada deploy; así el PIN no hay que crearlo de nuevo y nadie se adelanta |

   `PORT` no se define: Render lo pone y el servidor lo lee.
4. Cada `git push` vuelve a desplegar. Las direcciones quedan
   `https://pilas-9t85.onrender.com`, `/maestra` y `/pantalla`.

**Ojo con el plan gratis:** se duerme a los 15 minutos sin uso y tarda cerca de un
minuto en despertar. Abrí `/pantalla` un par de minutos antes de la clase. Los
cuestionarios se pierden con el próximo deploy: la maestra guarda el CSV y lo
vuelve a subir.

Lo mismo sirve en cualquier VPS detrás de un proxy: mismas dos variables.

## Mapa del código

```
server.js           HTTP, SSE, rutas y arranque
lib/room.js         la máquina de estados de la sala (el corazón)
lib/auth.js         PIN con scrypt, cookie y límite de intentos
lib/db.js           SQLite: PIN, sesiones e historial
lib/bank.js         bancos de preguntas e importador de CSV
public/pantalla.*   pantalla del aula (HDMI)
public/maestra.*    teléfono de la maestra
public/index.html   celular del alumno (+ alumno.js)
public/bus.js       conexión, reloj y ayudas compartidas
test-room.js        chequeos del núcleo
test-csv.js         chequeos del importador
```
