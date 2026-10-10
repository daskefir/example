import nacl from 'tweetnacl';
import { concat, readUint48, utf8, writeUint48 } from './bytes';
import { boxKeyForId, Identity } from './identity';

/**
 * Wire format (version 1), stored base64-encoded in an SPL Memo:
 *
 *   outer  = version(1) | ephemeralPub(32) | nonce(24) | box(inner)
 *   inner  = senderId(32) | timestamp ms(6) | signature(64) | textLen(2) | text | random padding
 *
 * The sender's ID lives only inside the ciphertext ("sealed sender"), so an
 * observer of the chain learns nothing about who wrote the message. A fresh
 * ephemeral key per message gives every envelope a different look. The
 * signature binds sender, recipient, time and text so a recipient can trust
 * who wrote it and nobody can re-address it to a different person.
 */
export const ENVELOPE_VERSION = 1;
export const MAX_TEXT_BYTES = 400;
const PAD_BLOCK = 64;
const SIGN_DOMAIN = utf8.encode('solmsg/message/v1');
const HEADER = 1 + 32 + 24;
const INNER_FIXED = 32 + 6 + 64 + 2;

export interface OpenedMessage {
  senderId: Uint8Array;
  timestamp: number;
  text: string;
}

function signedBytes(sender: Uint8Array, recipient: Uint8Array, ts: Uint8Array, text: Uint8Array) {
  return concat(SIGN_DOMAIN, sender, recipient, ts, text);
}

export function textByteLength(text: string): number {
  return utf8.encode(text).length;
}

export function sealMessage(
  sender: Identity,
  recipientId: Uint8Array,
  text: string,
  timestamp: number = Date.now(),
): Uint8Array {
  const body = utf8.encode(text);
  if (body.length === 0) throw new Error('Message is empty');
  if (body.length > MAX_TEXT_BYTES) throw new Error(`Message is longer than ${MAX_TEXT_BYTES} bytes`);

  const ts = writeUint48(timestamp);
  const sig = nacl.sign.detached(signedBytes(sender.signPublicKey, recipientId, ts, body), sender.signSecretKey);
  const len = new Uint8Array([body.length >> 8, body.length & 0xff]);
  const unpadded = INNER_FIXED + body.length;
  // Pad to a block boundary so ciphertext length leaks only a coarse size.
  const padded = Math.ceil(unpadded / PAD_BLOCK) * PAD_BLOCK;
  const inner = concat(sender.signPublicKey, ts, sig, len, body, nacl.randomBytes(padded - unpadded));

  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const boxed = nacl.box(inner, nonce, boxKeyForId(recipientId), eph.secretKey);
  return concat(new Uint8Array([ENVELOPE_VERSION]), eph.publicKey, nonce, boxed);
}

/** Returns null for anything not addressed to `me` or not authentic. */
export function openMessage(me: Identity, envelope: Uint8Array): OpenedMessage | null {
  if (envelope.length < HEADER + nacl.box.overheadLength + INNER_FIXED) return null;
  if (envelope[0] !== ENVELOPE_VERSION) return null;
  const ephPub = envelope.subarray(1, 33);
  const nonce = envelope.subarray(33, 57);
  const inner = nacl.box.open(envelope.subarray(57), nonce, ephPub, me.boxSecretKey);
  if (!inner || inner.length < INNER_FIXED) return null;

  const senderId = inner.slice(0, 32);
  const ts = inner.subarray(32, 38);
  const sig = inner.subarray(38, 102);
  const len = (inner[102] << 8) | inner[103];
  if (len === 0 || len > MAX_TEXT_BYTES || INNER_FIXED + len > inner.length) return null;
  const body = inner.subarray(104, 104 + len);
  if (!nacl.sign.detached.verify(signedBytes(senderId, me.signPublicKey, ts, body), sig, senderId)) return null;

  return { senderId, timestamp: readUint48(ts, 0), text: utf8.decode(body) };
}
