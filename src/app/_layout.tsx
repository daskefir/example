import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../components/ui';
import { MessengerProvider, useMessenger } from '../state/messenger';

function Navigator() {
  const { ready, identity, settings } = useMessenger();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const onboarded = !!identity && settings.acceptedTerms;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="index" options={{ title: 'Chats' }} />
        <Stack.Screen name="chat/[id]" options={{ title: '' }} />
        <Stack.Screen name="add-contact" options={{ title: 'New chat', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="terms" options={{ title: 'Terms of Use', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <MessengerProvider>
      <StatusBar style="light" />
      <Navigator />
    </MessengerProvider>
  );
}
