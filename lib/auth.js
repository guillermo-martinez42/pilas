// El PIN de la docente. Todo lo importante pasa aquí:
//  - se guarda hasheado con scrypt, nunca en claro;
//  - se compara en tiempo constante;
//  - hay límite de intentos, porque 6 dígitos sin límite los adivina
//    un alumno aburrido en un rato.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PIN_RE = /^\d{6}$/;
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
export const COOKIE = 'tb_host';

const fails = new Map();   // ip -> { n, until }

export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(String(pin), salt, 32).toString('hex') };
}

export function pinMatches(pin, salt, expected) {
  const a = Buffer.from(hashPin(pin, salt).hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function lockedFor(ip) {
  const f = fails.get(ip);
  if (!f || !f.until) return 0;
  const left = f.until - Date.now();
  if (left <= 0) { fails.delete(ip); return 0; }
  return left;
}

export function noteFail(ip) {
  const f = fails.get(ip) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.n = 0; }
  fails.set(ip, f);
}

export function noteOk(ip) { fails.delete(ip); }

export function newToken() { return randomBytes(32).toString('hex'); }

export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// Secure sólo con https (PUBLIC_URL). Probando en local sobre HTTP, con Secure
// el navegador no guardaría la cookie.
// httpOnly siempre, para que ningún script de la página pueda leer el token.
const SECURE = (process.env.PUBLIC_URL ?? 'https').startsWith('https') ? '; Secure' : '';

export function setHostCookie(res, token) {
  res.setHeader('Set-Cookie', COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000' + SECURE);
}

export function clearHostCookie(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + SECURE);
}
