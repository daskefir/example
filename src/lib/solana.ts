import bs58 from 'bs58';
import {
  Finality,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { b64, utf8 } from './bytes';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
/** Prefix that marks our memos so unrelated memos on an inbox are skipped cheaply. */
export const MEMO_PREFIX = 'sm1:';
const COMMITMENT: Finality = 'confirmed';

export type Network = 'devnet' | 'mainnet-beta';

export const DEFAULT_RPC: Record<Network, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

export function makeConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, COMMITMENT);
}

/**
 * One message = one transaction with two instructions:
 *  1. a 0-lamport transfer to the recipient's inbox address, which only
 *     exists so the transaction is indexed under that address;
 *  2. an SPL Memo carrying the encrypted envelope.
 * The fee payer is the sender's fee wallet, not their ID.
 */
export function buildMessageTransaction(
  feePayer: PublicKey,
  inbox: PublicKey,
  envelope: Uint8Array,
  recentBlockhash: string,
): Transaction {
  const tx = new Transaction({ feePayer, recentBlockhash });
  tx.add(SystemProgram.transfer({ fromPubkey: feePayer, toPubkey: inbox, lamports: 0 }));
  tx.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(MEMO_PREFIX + b64.encode(envelope), 'utf8'),
    }),
  );
  return tx;
}

export async function sendEnvelope(
  connection: Connection,
  feeWallet: Keypair,
  inbox: PublicKey,
  envelope: Uint8Array,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(COMMITMENT);
  const tx = buildMessageTransaction(feeWallet.publicKey, inbox, envelope, blockhash);
  tx.sign(feeWallet);
  const signature = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: COMMITMENT });
  const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, COMMITMENT);
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}

export interface InboxItem {
  signature: string;
  blockTime: number | null;
  envelope: Uint8Array;
}

export function extractEnvelopes(tx: ParsedTransactionWithMeta | null): Uint8Array[] {
  if (!tx || tx.meta?.err) return [];
  const out: Uint8Array[] = [];
  for (const ix of tx.transaction.message.instructions) {
    if (!ix.programId.equals(MEMO_PROGRAM_ID)) continue;
    let memo: string | undefined;
    if ('parsed' in ix && typeof ix.parsed === 'string') memo = ix.parsed;
    else if ('data' in ix) memo = utf8.decode(bs58.decode(ix.data));
    if (!memo?.startsWith(MEMO_PREFIX)) continue;
    try {
      out.push(b64.decode(memo.slice(MEMO_PREFIX.length)));
    } catch {
      // Not ours or malformed: ignore.
    }
  }
  return out;
}

/**
 * Fetches transactions sent to `inbox` newer than `until` (exclusive),
 * oldest first. Returns the newest signature seen so callers can resume.
 */
export async function fetchInbox(
  connection: Connection,
  inbox: PublicKey,
  until?: string,
  maxPages = 5,
): Promise<{ items: InboxItem[]; newest?: string }> {
  const sigs: { signature: string; blockTime?: number | null; err: unknown }[] = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const batch = await connection.getSignaturesForAddress(inbox, { before, until, limit: 100 }, COMMITMENT);
    sigs.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].signature;
  }
  const newest = sigs[0]?.signature ?? until;
  const ok = sigs.filter((s) => !s.err).reverse();

  const items: InboxItem[] = [];
  for (let i = 0; i < ok.length; i += 25) {
    const chunk = ok.slice(i, i + 25);
    const txs = await connection.getParsedTransactions(
      chunk.map((s) => s.signature),
      { commitment: COMMITMENT, maxSupportedTransactionVersion: 0 },
    );
    txs.forEach((tx, j) => {
      for (const envelope of extractEnvelopes(tx)) {
        items.push({ signature: chunk[j].signature, blockTime: tx?.blockTime ?? null, envelope });
      }
    });
  }
  return { items, newest };
}

export async function getBalanceSol(connection: Connection, address: PublicKey): Promise<number> {
  return (await connection.getBalance(address, COMMITMENT)) / LAMPORTS_PER_SOL;
}

export async function requestDevnetAirdrop(connection: Connection, address: PublicKey): Promise<void> {
  const signature = await connection.requestAirdrop(address, LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash(COMMITMENT);
  await connection.confirmTransaction({ signature, ...latest }, COMMITMENT);
}
