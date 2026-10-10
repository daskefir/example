import { Buffer } from 'buffer';

export const utf8 = {
  encode: (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8')),
  decode: (b: Uint8Array): string => Buffer.from(b).toString('utf8'),
};

export const b64 = {
  encode: (b: Uint8Array): string => Buffer.from(b).toString('base64'),
  decode: (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64')),
};

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function writeUint48(n: number): Uint8Array {
  const out = new Uint8Array(6);
  let v = Math.floor(n);
  for (let i = 5; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

export function readUint48(b: Uint8Array, off: number): number {
  let v = 0;
  for (let i = 0; i < 6; i++) v = v * 256 + b[off + i];
  return v;
}
