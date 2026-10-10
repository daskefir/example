import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';
import {
  exportRecoveryKey,
  generateSeed,
  identityFromSeed,
  importRecoveryKey,
  inboxAddressForId,
  parseId,
} from '../src/lib/identity';
import { MAX_TEXT_BYTES, openMessage, sealMessage } from '../src/lib/envelope';
import { buildMessageTransaction, extractEnvelopes, MEMO_PROGRAM_ID, MEMO_PREFIX } from '../src/lib/solana';
import { b64 } from '../src/lib/bytes';

const alice = identityFromSeed(generateSeed());
const bob = identityFromSeed(generateSeed());
const eve = identityFromSeed(generateSeed());

describe('identity', () => {
  it('round-trips the recovery key', () => {
    const restored = importRecoveryKey(exportRecoveryKey(alice));
    expect(restored.id).toBe(alice.id);
    expect(restored.feeWallet.publicKey.equals(alice.feeWallet.publicKey)).toBe(true);
  });

  it('keeps ID, fee wallet and inbox distinct', () => {
    const inbox = inboxAddressForId(alice.signPublicKey).toBase58();
    expect(new Set([alice.id, alice.feeWallet.publicKey.toBase58(), inbox]).size).toBe(3);
  });

  it('rejects malformed IDs', () => {
    expect(() => parseId('not-base58-0OIl')).toThrow();
    expect(() => parseId('abc')).toThrow();
    expect(parseId(bob.id)).toEqual(bob.signPublicKey);
  });
});

describe('envelope', () => {
  it('delivers text and authenticated sender to the recipient', () => {
    const env = sealMessage(alice, bob.signPublicKey, 'привет 👋', 1_700_000_000_123);
    const opened = openMessage(bob, env);
    expect(opened?.text).toBe('привет 👋');
    expect(opened?.timestamp).toBe(1_700_000_000_123);
    expect(opened?.senderId).toEqual(alice.signPublicKey);
  });

  it('is unreadable by anyone else', () => {
    expect(openMessage(eve, sealMessage(alice, bob.signPublicKey, 'secret'))).toBeNull();
  });

  it('does not contain the sender ID in clear and differs every time', () => {
    const a = sealMessage(alice, bob.signPublicKey, 'same');
    const b = sealMessage(alice, bob.signPublicKey, 'same');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a).includes(Buffer.from(alice.signPublicKey))).toBe(false);
  });

  it('rejects tampered ciphertext', () => {
    const env = sealMessage(alice, bob.signPublicKey, 'hi');
    env[env.length - 1] ^= 1;
    expect(openMessage(bob, env)).toBeNull();
  });

  it('rejects a forged sender', () => {
    // Eve builds an inner payload claiming to be Alice but signs with her own key.
    const forged = sealMessage({ ...eve, signPublicKey: alice.signPublicKey }, bob.signPublicKey, 'hi');
    expect(openMessage(bob, forged)).toBeNull();
  });

  it('enforces the size limit', () => {
    expect(() => sealMessage(alice, bob.signPublicKey, 'x'.repeat(MAX_TEXT_BYTES + 1))).toThrow();
    expect(() => sealMessage(alice, bob.signPublicKey, '')).toThrow();
  });
});

describe('transaction', () => {
  it('fits the largest message in a single Solana transaction', () => {
    const env = sealMessage(alice, bob.signPublicKey, 'я'.repeat(MAX_TEXT_BYTES / 2));
    const tx = buildMessageTransaction(
      alice.feeWallet.publicKey,
      inboxAddressForId(bob.signPublicKey),
      env,
      Keypair.generate().publicKey.toBase58(),
    );
    tx.sign(alice.feeWallet);
    expect(tx.serialize().length).toBeLessThanOrEqual(1232);
  });

  it('extracts envelopes from parsed and raw memo instructions', () => {
    const env = nacl.randomBytes(100);
    const memo = MEMO_PREFIX + b64.encode(env);
    const tx: any = {
      meta: { err: null },
      transaction: {
        message: {
          instructions: [
            { programId: MEMO_PROGRAM_ID, parsed: memo },
            { programId: MEMO_PROGRAM_ID, parsed: 'unrelated memo' },
          ],
        },
      },
    };
    expect(extractEnvelopes(tx)).toEqual([env]);
  });
});
