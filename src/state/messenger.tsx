import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import bs58 from 'bs58';
import { openMessage, sealMessage } from '../lib/envelope';
import {
  exportRecoveryKey,
  generateSeed,
  Identity,
  identityFromSeed,
  importRecoveryKey,
  inboxAddressForId,
  parseId,
} from '../lib/identity';
import { fetchInbox, makeConnection, sendEnvelope } from '../lib/solana';
import { Contact, DEFAULT_SETTINGS, Message, Settings, storage } from '../lib/storage';

const POLL_MS = 15_000;

export function shortId(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

interface MessengerState {
  ready: boolean;
  identity: Identity | null;
  settings: Settings;
  contacts: Contact[];
  messages: Message[];
  syncing: boolean;
  lastSyncError: string | null;
  createIdentity(): Promise<void>;
  importIdentity(recoveryKey: string): Promise<void>;
  recoveryKey(): string;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  addContact(id: string, name: string): Contact;
  updateContact(id: string, patch: Partial<Omit<Contact, 'id'>>): void;
  deleteChat(id: string): void;
  sendMessage(peer: string, text: string): Promise<void>;
  retryMessage(key: string): Promise<void>;
  sync(): Promise<void>;
  wipe(): Promise<void>;
}

const Ctx = createContext<MessengerState | null>(null);

export function useMessenger(): MessengerState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMessenger must be used inside MessengerProvider');
  return v;
}

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  // Refs give async work (sync, send) the latest values without re-subscribing.
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const syncingRef = useRef(false);

  const connection = useMemo(() => makeConnection(settings.rpcUrl), [settings.rpcUrl]);

  useEffect(() => {
    (async () => {
      const [seed, s, c, m] = await Promise.all([
        storage.loadSeed(),
        storage.loadSettings(),
        storage.loadContacts(),
        storage.loadMessages(),
      ]);
      if (seed) setIdentity(identityFromSeed(bs58.decode(seed)));
      setSettings(s);
      setContacts(c);
      setMessages(m);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) storage.saveContacts(contacts);
  }, [ready, contacts]);
  useEffect(() => {
    if (ready) storage.saveMessages(messages);
  }, [ready, messages]);

  const saveIdentity = useCallback(async (id: Identity) => {
    await storage.saveSeed(exportRecoveryKey(id));
    setIdentity(id);
  }, []);

  const createIdentity = useCallback(() => saveIdentity(identityFromSeed(generateSeed())), [saveIdentity]);
  const importIdentity = useCallback((key: string) => saveIdentity(importRecoveryKey(key)), [saveIdentity]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      await storage.saveSettings(next);
      setSettings(next);
    },
    [settings],
  );

  const addContact = useCallback(
    (id: string, name: string): Contact => {
      parseId(id);
      if (identity && id === identity.id) throw new Error('This is your own ID');
      const existing = contactsRef.current.find((c) => c.id === id);
      const contact: Contact = {
        id,
        name: name.trim() || existing?.name || shortId(id),
        addedAt: existing?.addedAt ?? Date.now(),
        accepted: true,
        blocked: false,
      };
      setContacts((cs) => [...cs.filter((c) => c.id !== id), contact]);
      return contact;
    },
    [identity],
  );

  const updateContact = useCallback((id: string, patch: Partial<Omit<Contact, 'id'>>) => {
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteChat = useCallback((id: string) => {
    setMessages((ms) => ms.filter((m) => m.peer !== id));
    setContacts((cs) => cs.filter((c) => c.id !== id || c.blocked));
  }, []);

  const deliver = useCallback(
    async (msg: Message) => {
      if (!identity) throw new Error('No identity');
      const setStatus = (patch: Partial<Message>) =>
        setMessages((ms) => ms.map((m) => (m.key === msg.key ? { ...m, ...patch } : m)));
      try {
        const peer = parseId(msg.peer);
        const envelope = sealMessage(identity, peer, msg.text, msg.timestamp);
        const signature = await sendEnvelope(connection, identity.feeWallet, inboxAddressForId(peer), envelope);
        setStatus({ status: 'sent', signature });
      } catch (e) {
        setStatus({ status: 'failed' });
        throw e;
      }
    },
    [identity, connection],
  );

  const sendMessage = useCallback(
    async (peer: string, text: string) => {
      const msg: Message = {
        key: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        peer,
        fromMe: true,
        text,
        timestamp: Date.now(),
        status: 'sending',
      };
      setMessages((ms) => [...ms, msg]);
      // Sending to someone implicitly accepts their chat request.
      setContacts((cs) => cs.map((c) => (c.id === peer ? { ...c, accepted: true } : c)));
      await deliver(msg);
    },
    [deliver],
  );

  const retryMessage = useCallback(
    async (key: string) => {
      const target = messagesRef.current.find((m) => m.key === key);
      if (!target || target.status !== 'failed') return;
      setMessages((ms) => ms.map((m) => (m.key === key ? { ...m, status: 'sending' } : m)));
      await deliver(target);
    },
    [deliver],
  );

  const sync = useCallback(async () => {
    if (!identity || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const network = settings.network;
      const cursor = (await storage.loadCursor(network)) ?? undefined;
      const { items, newest } = await fetchInbox(connection, inboxAddressForId(identity.signPublicKey), cursor);

      const incoming: Message[] = [];
      const newContacts: Contact[] = [];
      const known = new Map(contactsRef.current.map((c) => [c.id, c]));
      items.forEach((item, i) => {
        const opened = openMessage(identity, item.envelope);
        if (!opened) return;
        const sender = bs58.encode(opened.senderId);
        let contact = known.get(sender);
        if (contact?.blocked) return;
        if (!contact) {
          contact = { id: sender, name: shortId(sender), addedAt: Date.now(), accepted: false, blocked: false };
          known.set(sender, contact);
          newContacts.push(contact);
        }
        incoming.push({
          key: `${item.signature}:${i}`,
          peer: sender,
          fromMe: false,
          text: opened.text,
          timestamp: opened.timestamp,
          status: 'received',
          signature: item.signature,
        });
      });

      if (newContacts.length) setContacts((cs) => [...cs, ...newContacts]);
      if (incoming.length) {
        setMessages((ms) => {
          const seen = new Set(ms.map((m) => m.key));
          return [...ms, ...incoming.filter((m) => !seen.has(m.key))];
        });
      }
      if (newest && newest !== cursor) await storage.saveCursor(network, newest);
      setLastSyncError(null);
    } catch (e) {
      setLastSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [identity, connection, settings.network]);

  useEffect(() => {
    if (!identity) return;
    sync();
    let timer: ReturnType<typeof setInterval> | null = setInterval(sync, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
        if (!timer) timer = setInterval(sync, POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [identity, sync]);

  const wipe = useCallback(async () => {
    await storage.wipe();
    setIdentity(null);
    setContacts([]);
    setMessages([]);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value: MessengerState = {
    ready,
    identity,
    settings,
    contacts,
    messages,
    syncing,
    lastSyncError,
    createIdentity,
    importIdentity,
    recoveryKey: () => (identity ? exportRecoveryKey(identity) : ''),
    updateSettings,
    addContact,
    updateContact,
    deleteChat,
    sendMessage,
    retryMessage,
    sync,
    wipe,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
