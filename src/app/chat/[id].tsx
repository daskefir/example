import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_TEXT_BYTES, textByteLength } from '../../lib/envelope';
import { Button, colors, styles } from '../../components/ui';
import { shortId, useMessenger } from '../../state/messenger';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contacts, messages, sendMessage, retryMessage, updateContact, deleteChat } = useMessenger();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  const contact = contacts.find((c) => c.id === id);
  const thread = useMemo(
    () => messages.filter((m) => m.peer === id).sort((a, b) => b.timestamp - a.timestamp),
    [messages, id],
  );
  const bytes = textByteLength(draft);
  const tooLong = bytes > MAX_TEXT_BYTES;

  const send = () => {
    const text = draft.trim();
    if (!text || tooLong) return;
    setDraft('');
    sendMessage(id, text).catch((e) =>
      Alert.alert('Not sent', e instanceof Error ? e.message : String(e)),
    );
  };

  const block = () => {
    updateContact(id, { blocked: true });
    router.back();
  };
  const report = () => {
    Alert.alert('Report and block?', 'The sender will be blocked and this conversation deleted from your device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          updateContact(id, { blocked: true });
          deleteChat(id);
          router.back();
        },
      },
    ]);
  };
  const rename = () =>
    Alert.prompt?.('Rename', undefined, (name) => name && updateContact(id, { name: name.trim() }), 'plain-text', contact?.name);

  const menu = () => {
    const actions: [string, () => void][] = [
      ...(Platform.OS === 'ios' ? ([['Rename', rename]] as [string, () => void][]) : []),
      ['Block', block],
      ['Report', report],
      ['Delete chat', () => { deleteChat(id); router.back(); }],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a[0]), 'Cancel'], cancelButtonIndex: actions.length, destructiveButtonIndex: [1, 2, 3] },
        (i) => actions[i]?.[1](),
      );
    } else {
      Alert.alert(contact?.name ?? '', undefined, [
        ...actions.map(([text, onPress]) => ({ text, onPress })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const isRequest = contact && !contact.accepted;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          title: contact?.name ?? shortId(id),
          headerRight: () => (
            <Pressable onPress={menu} hitSlop={12}>
              <Text style={{ color: colors.accent, fontSize: 22 }}>⋯</Text>
            </Pressable>
          ),
        }}
      />
      {isRequest ? (
        <View style={[styles.section, { margin: 12 }]}>
          <Text style={styles.body}>Message request from an unknown ID</Text>
          <Text style={styles.mono} selectable>{id}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} title="Accept" onPress={() => updateContact(id, { accepted: true })} />
            <Button style={{ flex: 1 }} title="Block" variant="secondary" onPress={block} />
            <Button style={{ flex: 1 }} title="Report" variant="danger" onPress={report} />
          </View>
        </View>
      ) : null}
      <FlatList
        inverted
        data={isRequest ? [] : thread}
        keyExtractor={(m) => m.key}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        renderItem={({ item }) => (
          <Pressable
            disabled={item.status !== 'failed'}
            onPress={() => retryMessage(item.key).catch(() => {})}
            style={{
              alignSelf: item.fromMe ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              backgroundColor: item.fromMe ? colors.bubbleMine : colors.bubbleTheirs,
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={styles.body} selectable>{item.text}</Text>
            <Text style={[styles.muted, { fontSize: 11, alignSelf: 'flex-end' }]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {item.fromMe ? ` · ${item.status === 'failed' ? 'failed, tap to retry' : item.status}` : ''}
            </Text>
          </Pressable>
        )}
      />
      {isRequest ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            padding: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Encrypted message"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.field, { maxHeight: 120 }]}
            />
            {bytes > MAX_TEXT_BYTES * 0.8 ? (
              <Text style={[styles.muted, { fontSize: 11, color: tooLong ? colors.danger : colors.muted }]}>
                {bytes}/{MAX_TEXT_BYTES} bytes
              </Text>
            ) : null}
          </View>
          <Button title="Send" onPress={send} disabled={!draft.trim() || tooLong} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
