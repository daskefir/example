import { describe, expect, it } from 'vitest';
import { generateSeed, identityFromSeed, inboxAddressForId } from '../src/lib/identity';
import { openMessage, sealMessage } from '../src/lib/envelope';
import { DEFAULT_RPC, fetchInbox, makeConnection, requestDevnetAirdrop, sendEnvelope } from '../src/lib/solana';

// End-to-end round trip against the real devnet. Needs internet access:
//   DEVNET=1 npm test
// Set DEVNET_RPC to use another endpoint if the public one rate-limits airdrops.
describe.skipIf(!process.env.DEVNET)('devnet round trip', () => {
  it('sends a message on-chain and the recipient reads it back', async () => {
    const connection = makeConnection(process.env.DEVNET_RPC ?? DEFAULT_RPC.devnet);
    const alice = identityFromSeed(generateSeed());
    const bob = identityFromSeed(generateSeed());
    await requestDevnetAirdrop(connection, alice.feeWallet.publicKey);

    const inbox = inboxAddressForId(bob.signPublicKey);
    await sendEnvelope(connection, alice.feeWallet, inbox, sealMessage(alice, bob.signPublicKey, 'hello from devnet'));

    const { items } = await fetchInbox(connection, inbox);
    const opened = items.map((i) => openMessage(bob, i.envelope)).find(Boolean);
    expect(opened?.text).toBe('hello from devnet');
    expect(opened?.senderId).toEqual(alice.signPublicKey);
  }, 120_000);
});
