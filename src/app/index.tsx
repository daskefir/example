import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Link, Stack, router } from 'expo-router';
import { colors, styles } from '../components/ui';
import { useMessenger } from '../state/messenger';

interface Row {
  id: string;
  name: string;
  preview: string;
  time: number;
  request: boolean;
}

export default function Chats() {
  const { contacts, messages, syncing, sync, lastSyncError } = useMessenger();

  const rows = useMemo<Row[]>(() => {
    const last = new Map<string, (typeof messages)[number]>();
    for (const m of messages) {
      const prev = last.get(m.peer);
      if (!prev || prev.timestamp <= m.timestamp) last.set(m.peer, m);
    }
    return contacts
      .filter((c) => !c.blocked)
      .map((c) => {
        const m = last.get(c.id);
        return {
          id: c.id,
          name: c.name,
          preview: m ? `${m.fromMe ? 'You: ' : ''}${m.text}` : 'No messages yet',
          time: m?.timestamp ?? c.addedAt,
          request: !c.accepted,
        };
      })
      .sort((a, b) => Number(a.request) - Number(b.request) || b.time - a.time);
  }, [contacts, messages]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Link href="/settings" style={{ color: colors.accent, fontSize: 16 }}>
              Settings
            </Link>
          ),
          headerRight: () => (
            <Link href="/add-contact" style={{ color: colors.accent, fontSize: 16 }}>
              New
            </Link>
          ),
        }}
      />
      {lastSyncError ? (
        <Text style={[styles.muted, { color: colors.danger, padding: 12 }]} numberOfLines={2}>
          Sync failed: {lastSyncError}
        </Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={sync} tintColor={colors.muted} />}
        ListEmptyComponent={
          <View style={[styles.content, { alignItems: 'center', paddingTop: 80 }]}>
            <Text style={styles.body}>No chats yet</Text>
            <Text style={[styles.muted, { textAlign: 'center' }]}>
              Share your ID from Settings, or tap “New” to message someone by their ID.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: pressed ? colors.card : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[styles.body, { fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.request ? (
                <Text style={[styles.muted, { color: colors.accent }]}>Request</Text>
              ) : (
                <Text style={styles.muted}>{new Date(item.time).toLocaleDateString()}</Text>
              )}
            </View>
            <Text style={styles.muted} numberOfLines={1}>
              {item.request ? 'Unknown sender — open to review' : item.preview}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
