import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Button, Field, styles } from '../components/ui';
import { useMessenger } from '../state/messenger';

export default function AddContact() {
  const { addContact } = useMessenger();
  const [id, setId] = useState('');
  const [name, setName] = useState('');

  const save = () => {
    try {
      const contact = addContact(id, name);
      router.replace({ pathname: '/chat/[id]', params: { id: contact.id } });
    } catch (e) {
      Alert.alert('Invalid ID', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>Ask your contact for their Shade ID (Settings → My ID).</Text>
      <Field
        placeholder="Their ID"
        value={id}
        onChangeText={setId}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button title="Paste ID" variant="secondary" onPress={async () => setId((await Clipboard.getStringAsync()).trim())} />
      <Field placeholder="Name (only visible to you)" value={name} onChangeText={setName} />
      <Button title="Start chat" disabled={!id} onPress={save} />
    </ScrollView>
  );
}
