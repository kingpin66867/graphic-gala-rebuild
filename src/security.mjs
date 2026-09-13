import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const secret = () => randomBytes(24).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(value, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(value, encoded) {
  const [salt, key] = encoded.split(':');
  const actual = await derive(value, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const requireThat = (test, status, message) => { if (!test) throw new HttpError(status, message); };
export function text(value, label, max = 200, required = true) {
  requireThat(typeof value === 'string' || (!required && value == null), 400, `${label} must be text.`);
  const out = (value || '').trim();
  requireThat(!required || out.length > 0, 400, `${label} is required.`);
  requireThat(out.length <= max, 400, `${label} must be ${max} characters or fewer.`);
  return out;
}
export function email(value) {
  const out = text(value, 'Email', 254).toLowerCase();
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out), 400, 'Enter a valid email address.');
  return out;
}
export function upload(value) {
  requireThat(value && typeof value === 'object', 400, 'Select a design file.');
  const name = text(value.name, 'File name', 180).replace(/[\r\n"\\/]/g, '_');
  requireThat(typeof value.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value.data), 400, 'Invalid file encoding.');
  const data = Buffer.from(value.data, 'base64');
  requireThat(data.length > 0 && data.length <= 5 * 1024 * 1024, 400, 'Files must be between 1 byte and 5 MB.');
  let mime = '';
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) mime = 'image/jpeg';
  if (data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
  if (data.subarray(0,5).toString() === '%PDF-') mime = 'application/pdf';
  requireThat(mime, 400, 'Use a PNG, JPG, WebP, or PDF file.');
  return { name, mime, data };
}
export function rateLimiter() {
  const entries = new Map();
  return (key, limit, window = 900_000) => {
    const time = Date.now();
    for (const [k, v] of entries) if (v.end <= time) entries.delete(k);
    const record = entries.get(key) || { count: 0, end: time + window };
    requireThat(record.count < limit, 429, 'Too many attempts. Please try again in 15 minutes.');
    record.count++; entries.set(key, record);
  };
}
