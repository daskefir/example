import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { Button, colors, Field, Section, styles } from '../components/ui';
import { DEFAULT_RPC, getBalanceSol, makeConnection, Network, requestDevnetAirdrop } from '../lib/solana';
import { useMessenger } from '../state/messenger';

export default function Settings() {
  const { identity, settings, updateSettings, recoveryKey, contacts, updateContact, wipe } = useMessenger();
  const [balance, setBalance] = useState<number | null>(null);
  const [rpc, setRpc] = useState(settings.rpcUrl);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);

  const fee = identity?.feeWallet.publicKey;
  const loadBalance = useCallback(
    () => (fee ? getBalanceSol(makeConnection(settings.rpcUrl), fee).catch(() => null) : Promise.resolve(null)),
    [fee, settings.rpcUrl],
  );
  const refresh = useCallback(async () => setBalance(await loadBalance()), [loadBalance]);
  useEffect(() => {
    let cancelled = false;
    loadBalance().then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [loadBalance]);

  if (!identity || !fee) return null;
  const blocked = contacts.filter((c) => c.blocked);

  const switchNetwork = async (network: Network) => {
    await updateSettings({ network, rpcUrl: DEFAULT_RPC[network] });
    setRpc(DEFAULT_RPC[network]);
  };

  const airdrop = async () => {
    setBusy(true);
    try {
      await requestDevnetAirdrop(makeConnection(settings.rpcUrl), fee);
      await refresh();
    } catch (e) {
      Alert.alert('Airdrop failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmWipe = () =>
    Alert.alert('Delete everything?', 'Without your recovery key this ID is lost forever.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: wipe },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="My ID — share with contacts">
        <Text style={styles.mono} selectable>{identity.id}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} variant="secondary" title="Copy" onPress={() => Clipboard.setStringAsync(identity.id)} />
          <Button style={{ flex: 1 }} variant="secondary" title="Share" onPress={() => Share.share({ message: identity.id })} />
        </View>
      </Section>

      <Section title={`Fee wallet · ${settings.network}`}>
        <Text style={styles.muted}>
          Pays the network fee for each message you send. It is not linked to your ID on-chain. For privacy, fund it
          from a source not tied to your real identity.
        </Text>
        <Text style={styles.mono} selectable>{fee.toBase58()}</Text>
        <Text style={styles.body}>Balance: {balance === null ? '—' : `${balance.toFixed(6)} SOL`}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} variant="secondary" title="Copy address" onPress={() => Clipboard.setStringAsync(fee.toBase58())} />
          <Button style={{ flex: 1 }} variant="secondary" title="Refresh" onPress={refresh} />
        </View>
        {settings.network === 'devnet' ? (
          <Button title="Get 1 test SOL (devnet)" disabled={busy} onPress={airdrop} />
        ) : null}
      </Section>

      <Section title="Network">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['devnet', 'mainnet-beta'] as Network[]).map((n) => (
            <Button
              key={n}
              style={{ flex: 1 }}
              title={n}
              variant={settings.network === n ? 'primary' : 'secondary'}
              onPress={() => switchNetwork(n)}
            />
          ))}
        </View>
        <Field value={rpc} onChangeText={setRpc} autoCapitalize="none" autoCorrect={false} placeholder="RPC URL" />
        <Text style={styles.muted}>
          The RPC provider can see which inbox you poll and your IP address. Use your own node or a trusted provider.
        </Text>
        <Button title="Save RPC URL" variant="secondary" disabled={rpc === settings.rpcUrl} onPress={() => updateSettings({ rpcUrl: rpc.trim() })} />
      </Section>

      <Section title="Recovery key">
        <Text style={styles.muted}>Anyone with this key can read your messages and act as you. Store it offline.</Text>
        {showKey ? (
          <>
            <Text style={styles.mono} selectable>{recoveryKey()}</Text>
            <Button variant="secondary" title="Copy" onPress={() => Clipboard.setStringAsync(recoveryKey())} />
            <Button variant="secondary" title="Hide" onPress={() => setShowKey(false)} />
          </>
        ) : (
          <Button variant="secondary" title="Reveal recovery key" onPress={() => setShowKey(true)} />
        )}
      </Section>

      {blocked.length ? (
        <Section title="Blocked">
          {blocked.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.body}>{c.name}</Text>
              <Button variant="secondary" title="Unblock" onPress={() => updateContact(c.id, { blocked: false })} />
            </View>
          ))}
        </Section>
      ) : null}

      <Link href="/terms" style={{ color: colors.accent, textAlign: 'center' }}>
        Terms of Use
      </Link>
      <Button variant="danger" title="Delete ID and all data" onPress={confirmWipe} />
    </ScrollView>
  );
}
