# TutorBox

Cuestionarios en el aula **sin internet**. Corre en una mini PC con Linux
conectada al router del salón y al proyector por HDMI.

- **Pantalla del aula** (proyector) — la pregunta, el tiempo y el código QR.
- **Teléfono de la maestra** — elige el tema, ve quién contestó, avanza.
- **Celular de cada alumno** — responde A, B, C o D.

Todo pasa por la red local. Si se cae el internet de la escuela, no cambia nada:
el TutorBox nunca lo usó.

---

## El día a día

1. Encendés la mini PC. La pantalla del aula se abre sola con el **código QR**.
2. Los alumnos escanean el QR con la cámara y escriben su nombre.
3. Abrís `/maestra` en tu teléfono, ponés tu PIN y seguís los cuatro pasos:
   **tema → cuántas preguntas → quiénes están listos → comenzar**.
4. Cada pregunta dura 20 segundos, pero vos decidís cuándo pasar a la siguiente.
5. Al final: promedio del grupo, clasificación, preguntas más difíciles y los
   errores que se repiten. El botón *Guardar reporte del grupo* baja un Excel.

Mientras juegan, en tu teléfono ves **qué contestó cada alumno en vivo**. Eso no
se proyecta: en la pared solo salen la pregunta y el tiempo.

Si más de la mitad del grupo elige **el mismo error**, TutorBox te avisa y te
ofrece explicarlo por voz.

---

## Cómo entran los alumnos

El QR de la pantalla ya lleva el código de sala adentro: escanear es un paso, no dos.
Quien prefiera teclear, entra a la dirección que aparece junto al QR y escribe el
código de 4 números.

**Si un celular dice "esta red no tiene internet":** hay que elegir
*Mantener conexión* (Android) o apagar los datos móviles. Si no, el teléfono se
sale del wifi del salón y se desconecta del juego.

---

## Tu PIN

La primera vez que abrís `/maestra`, TutorBox te pide crear un **PIN de 6 números**.
Ese PIN es solo tuyo: los alumnos nunca lo ven, y el código de sala que sí ven
no sirve para entrar como maestra.

- Después de ponerlo una vez, **ese teléfono queda recordado** y no te lo vuelve
  a pedir.
- A los 5 intentos fallidos se bloquea un minuto, para que nadie lo adivine.
- **Si lo olvidás:** en la mini PC, `npm run reset-pin`. Después volvés a
  `/maestra` y creás uno nuevo. Hace falta estar frente a la máquina.

---

## Poner tus propias preguntas

En el paso 1 (elegir tema) hay dos botones:

1. **Bajar plantilla** — te da un archivo con ejemplos y las columnas en orden.
2. Lo abrís en Excel, borrás los ejemplos y escribís tus preguntas.
3. Guardás como CSV **con el nombre del tema** (`Fracciones.csv` → tema *Fracciones*)
   y **Subir mi archivo**. El tema aparece al instante.

Una fila por pregunta, seis columnas, sin nada más:

| Columna | Qué va |
|:--|:--|
| 1 | El número de la pregunta (1, 2, 3…) |
| 2 | La pregunta |
| 3 | **La respuesta correcta** |
| 4, 5, 6 | Las otras respuestas (podés dejar una o dos vacías) |

```
1;¿Cuánto es 24 + 18?;42;32;41;46
2;¿Cuál palabra lleva tilde?;árbol;papel;reloj;
3;Escribí con tus palabras qué aprendiste hoy.;;;;
```

La correcta siempre va en la columna 3: TutorBox las baraja al importar, así no
cae siempre en la A. Si la primera fila es un encabezado, se salta sola.

### Preguntas de respuesta abierta

Dejá **las cuatro respuestas vacías** (fila 3 del ejemplo). En el celular aparece
una caja de texto (hasta 200 letras) en vez de las opciones. Mientras contestan,
vos ves en tu panel quién ya escribió y **qué escribió cada uno**. Estas preguntas
**no dan puntos** — no hay respuesta correcta que comparar — así que no entran en
el promedio ni en la clasificación. Al terminar el juego, el botón *Descargar
respuestas escritas* baja un CSV con una fila por alumno y pregunta.

Si una fila tiene un problema (una sola respuesta, sin pregunta), **se importan
todas las demás** y te dice cuáles saltó. No perdés 40 preguntas por un typo.

Los avisos de "más de la mitad eligió el mismo error" y la explicación por voz
sólo existen en los temas que trae TutorBox: el archivo simple no los lleva.

---

## Instalar en la mini PC

Necesita **Node 22.5 o más nuevo** (SQLite viene adentro de Node, no se instala aparte).

```bash
git clone <este-repo> tutorbox && cd tutorbox
bash scripts/instalar-linux.sh
```

Eso deja el servidor arrancando solo al encender, la pantalla del aula abierta a
pantalla completa en el HDMI, y el puerto 80 habilitado para que la dirección sea
`http://192.168.1.50` y no `http://192.168.1.50:3000`.

**Después de instalar, un paso a mano:** entrá al router y reservale a la mini PC
una **IP fija** (en el router se llama *DHCP reservation* o *IP fija*). Si la IP
cambia, el código QR deja de servir.

## Probarlo en Windows o Mac

```bash
npm install
npm run seed-banks
npm start          # si el puerto 80 no se puede, usa el 3000 solo
```

La consola imprime las tres direcciones. Para forzar una IP: `HOST_IP=192.168.1.50 npm start`.

```bash
npm test           # chequeos del núcleo y del importador de CSV
```

---

## Si algo falla

| Pasa esto | Es por esto |
|:--|:--|
| El QR no lleva a ningún lado | Cambió la IP de la mini PC. Reservala fija en el router. |
| Un alumno se desconecta solo | Su teléfono se salió del wifi por no tener internet. *Mantener conexión* o apagar datos móviles. |
| Olvidaste el PIN | `npm run reset-pin` en la mini PC. |
| No entra nadie | Revisá que estén en el **mismo wifi**, no en otro de la escuela. |
| La dirección sale rara (26.x, 172.x) | La máquina tiene una VPN o red virtual. Arrancá con `HOST_IP=` y la dirección buena. |
| No se oye la explicación | Subí el volumen del proyector. Y ojo con el k'iche' (abajo). |
| Se apaga la pantalla sola | El instalador ya desactiva el protector; si vuelve, revisá el ahorro de energía del escritorio. |

Ver qué está pasando: `sudo journalctl -u tutorbox -f`

---

## La voz

- **Español:** lo lee la voz del sistema de la mini PC. Funciona sin internet.
  *Conviene probarlo en la máquina de verdad*: si esa instalación de Linux no
  trae voces en español, hay que instalarlas (`sudo apt install espeak-ng`) o
  usar audios grabados.
- **K'iche':** no existe voz sintética de k'iche' en ningún sistema. La única
  forma es **grabar los audios**. Se ponen en `public/audio/` y se nombran en las
  campos `audio_es` / `audio_quc` del banco (`banks/*.json`). Si una pregunta no tiene audio en
  k'iche', el botón no aparece.

## Notas técnicas

- **Sin paso de build.** HTML, CSS y módulos ES servidos tal cual. Se edita un
  archivo y se recarga: nada que compilar el día de la clase.
- **Tres dependencias** (`express`, `qrcode`, `csv-parse`). La base de datos es
  el `node:sqlite` que ya trae Node.
- **SSE, no WebSocket.** `EventSource` se reconecta solo cuando el wifi del aula
  parpadea, y no necesita librería.
- **El servidor manda.** El paso, el cronómetro y la validación de respuestas
  viven en el servidor. La respuesta correcta **no se manda al celular del alumno
  ni al proyector** hasta que la maestra revela: si no, se lee en la pestaña de
  red del navegador.
- **Ponerlo en internet** es el mismo `node server.js` detrás de un proxy con dos
  variables de entorno (ver abajo). Sin ellas, se comporta como en el aula.
- Las tipografías están **auto-hospedadas** en `public/fonts/`. Nada se pide a
  Google: sin internet, la página se vería rota.

## Ponerlo en internet (Render, gratis)

No puede ser un sitio estático: las tres pantallas comparten una partida en vivo
que vive en el servidor. Pero sí corre gratis en Render.

1. Subí el repo a GitHub (privado está bien; `data/` no se sube).
2. En [render.com](https://render.com): **New → Web Service**, conectá el repo.
   Language *Node*, Build `npm ci`, Start `npm start`, Instance Type **Free**,
   región *Ohio* o *Virginia*. La versión de Node la toma de `.node-version`.
3. Variables de entorno:

   | Variable | Qué va |
   |:--|:--|
   | `PUBLIC_URL` | `https://<nombre>.onrender.com` — es lo que lleva el QR |
   | `TEACHER_PIN` | seis dígitos. El disco de Render se borra en cada deploy; así el PIN no hay que crearlo de nuevo y nadie se adelanta |

   `PORT` no se define: Render lo pone y el servidor lo lee.
4. Cada `git push` vuelve a desplegar. Las direcciones quedan
   `https://<nombre>.onrender.com`, `/maestra` y `/pantalla`.

**Ojo con el plan gratis:** se duerme a los 15 minutos sin uso y tarda cerca de un
minuto en despertar. Abrí `/pantalla` un par de minutos antes de la clase. Los CSV
que importe la maestra se pierden con el próximo deploy: los vuelve a subir, o los
hacés commit en `banks/`.

Lo mismo sirve en un VPS de $4 detrás de Caddy, o en la mini PC con un túnel de
Cloudflare: mismas dos variables, `PUBLIC_URL` con la dirección pública.

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
