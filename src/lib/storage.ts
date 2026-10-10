import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_RPC, Network } from './solana';

const SEED_KEY = 'solmsg.seed';

export interface Contact {
  id: string;
  name: string;
  addedAt: number;
  /** false for unknown senders until the user accepts the chat */
  accepted: boolean;
  blocked: boolean;
}

export type MessageStatus = 'sending' | 'sent' | 'failed' | 'received';

export interface Message {
  key: string;
  peer: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  status: MessageStatus;
  signature?: string;
}

export interface Settings {
  network: Network;
  rpcUrl: string;
  acceptedTerms: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  network: 'devnet',
  rpcUrl: DEFAULT_RPC.devnet,
  acceptedTerms: false,
};

const KEYS = {
  contacts: 'solmsg.contacts',
  messages: 'solmsg.messages',
  settings: 'solmsg.settings',
  cursor: (network: string) => `solmsg.cursor.${network}`,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const storage = {
  // The seed is kept in the iOS Keychain / Android Keystore, only on this device.
  loadSeed: () =>
    SecureStore.getItemAsync(SEED_KEY, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  saveSeed: (seed: string) =>
    SecureStore.setItemAsync(SEED_KEY, seed, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),

  loadContacts: () => readJson<Contact[]>(KEYS.contacts, []),
  saveContacts: (c: Contact[]) => AsyncStorage.setItem(KEYS.contacts, JSON.stringify(c)),

  loadMessages: () => readJson<Message[]>(KEYS.messages, []),
  saveMessages: (m: Message[]) => AsyncStorage.setItem(KEYS.messages, JSON.stringify(m)),

  loadSettings: async () => ({ ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(KEYS.settings, {})) }),
  saveSettings: (s: Settings) => AsyncStorage.setItem(KEYS.settings, JSON.stringify(s)),

  loadCursor: (network: string) => AsyncStorage.getItem(KEYS.cursor(network)),
  saveCursor: (network: string, sig: string) => AsyncStorage.setItem(KEYS.cursor(network), sig),

  async wipe() {
    await SecureStore.deleteItemAsync(SEED_KEY);
    await AsyncStorage.clear();
  },
};
