import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { Keypair, PublicKey } from '@solana/web3.js';
import { concat, utf8 } from './bytes';

/**
 * Everything a user owns is derived from one random 32-byte seed:
 *
 * - signing key (ed25519): the public half, base58-encoded, is the user's
 *   anonymous ID that they share with contacts. It never appears on-chain.
 * - box key (x25519): converted from the signing key, used to receive
 *   end-to-end encrypted messages.
 * - fee wallet (ed25519, separate derivation): pays Solana fees. It is
 *   unlinkable to the ID for anyone who does not hold the seed.
 */
export interface Identity {
  seed: Uint8Array;
  signPublicKey: Uint8Array;
  signSecretKey: Uint8Array;
  boxPublicKey: Uint8Array;
  boxSecretKey: Uint8Array;
  feeWallet: Keypair;
  id: string;
}

const FEE_DOMAIN = utf8.encode('solmsg/fee-wallet/v1');
const INBOX_DOMAIN = utf8.encode('solmsg/inbox/v1');

export function generateSeed(): Uint8Array {
  return nacl.randomBytes(32);
}

export function identityFromSeed(seed: Uint8Array): Identity {
  if (seed.length !== 32) throw new Error('Seed must be 32 bytes');
  const sign = nacl.sign.keyPair.fromSeed(seed);
  const feeSeed = nacl.hash(concat(FEE_DOMAIN, seed)).slice(0, 32);
  return {
    seed,
    signPublicKey: sign.publicKey,
    signSecretKey: sign.secretKey,
    boxPublicKey: edwardsToMontgomeryPub(sign.publicKey),
    boxSecretKey: edwardsToMontgomeryPriv(seed),
    feeWallet: Keypair.fromSeed(feeSeed),
    id: bs58.encode(sign.publicKey),
  };
}

/** Recovery key shown to the user for backup: base58 of the seed. */
export function exportRecoveryKey(identity: Identity): string {
  return bs58.encode(identity.seed);
}

export function importRecoveryKey(key: string): Identity {
  let seed: Uint8Array;
  try {
    seed = bs58.decode(key.trim());
  } catch {
    throw new Error('Recovery key is not valid base58');
  }
  if (seed.length !== 32) throw new Error('Recovery key has the wrong length');
  return identityFromSeed(seed);
}

/** Parses and validates a contact ID (base58 ed25519 public key). */
export function parseId(id: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = bs58.decode(id.trim());
  } catch {
    throw new Error('ID is not valid base58');
  }
  if (raw.length !== 32) throw new Error('ID has the wrong length');
  // Must be a valid curve point, otherwise we could not encrypt to it.
  edwardsToMontgomeryPub(raw);
  return raw;
}

export function boxKeyForId(idBytes: Uint8Array): Uint8Array {
  return edwardsToMontgomeryPub(idBytes);
}

/**
 * The on-chain address that tags transactions addressed to a user. It is a
 * hash of the ID, so only people who already know the ID can find the inbox,
 * and the ID itself never appears on-chain.
 */
export function inboxAddressForId(idBytes: Uint8Array): PublicKey {
  return new PublicKey(nacl.hash(concat(INBOX_DOMAIN, idBytes)).slice(0, 32));
}
