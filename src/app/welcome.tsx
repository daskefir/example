import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, Field, Section, styles } from '../components/ui';
import { useMessenger } from '../state/messenger';

export default function Welcome() {
  const { createIdentity, importIdentity, updateSettings } = useMessenger();
  const [agreed, setAgreed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await updateSettings({ acceptedTerms: true });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: 48 }]}>
          <Text style={styles.h1}>Shade</Text>
          <Text style={styles.body}>
            Anonymous, end-to-end encrypted messages delivered through the Solana blockchain. No phone number, no
            email, no servers of ours.
          </Text>

          <Section>
            <Text style={styles.muted}>• Your ID is a random key created on this device.</Text>
            <Text style={styles.muted}>• Messages are encrypted so only the recipient can read them.</Text>
            <Text style={styles.muted}>• Your ID never appears on-chain; the sender is hidden inside the encryption.</Text>
            <Text style={styles.muted}>• Messages on a blockchain are permanent and cannot be deleted from it.</Text>
          </Section>

          <Pressable
            onPress={() => setAgreed(!agreed)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: colors.accent }} />
            <Text style={[styles.muted, { flex: 1 }]}>
              I agree to the{' '}
              <Link href="/terms" style={{ color: colors.accent }}>
                Terms of Use
              </Link>{' '}
              — no objectionable content or abusive users are tolerated.
            </Text>
          </Pressable>

          {importing ? (
            <View style={{ gap: 12 }}>
              <Field
                placeholder="Recovery key"
                value={recovery}
                onChangeText={setRecovery}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <Button
                title="Restore"
                disabled={!agreed || !recovery || busy}
                onPress={() => run(() => importIdentity(recovery))}
              />
              <Button title="Back" variant="secondary" onPress={() => setImporting(false)} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Button title="Create anonymous ID" disabled={!agreed || busy} onPress={() => run(createIdentity)} />
              <Button title="I have a recovery key" variant="secondary" onPress={() => setImporting(true)} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
