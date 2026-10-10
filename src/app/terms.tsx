import { ScrollView, Text } from 'react-native';
import { styles } from '../components/ui';

const TERMS = [
  ['Acceptable use', 'You must not use Shade to send content that is illegal, threatening, harassing, hateful, sexually exploitative, or that infringes the rights of others. There is zero tolerance for objectionable content and abusive users.'],
  ['Blocking and reporting', 'You can block any sender from inside a chat. Messages from blocked senders are discarded on your device. Reporting a chat blocks the sender and deletes the conversation from your device.'],
  ['Message requests', 'Messages from people you have not added appear as requests. Nothing from them is shown in your chat list until you open the request.'],
  ['Permanence', 'Encrypted messages are written to the public Solana blockchain and cannot be removed from it. Only the recipient can decrypt them, but transaction metadata (time, fee wallet, inbox address) is public.'],
  ['Your keys', 'Your recovery key is the only way to restore your ID. We do not have it and cannot recover it for you.'],
  ['Fees', 'Each message is a Solana transaction and costs a network fee paid from your fee wallet.'],
  ['No warranty', 'The app is provided “as is” without warranty of any kind.'],
];

export default function Terms() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {TERMS.map(([title, body]) => (
        <Text key={title} style={styles.body}>
          <Text style={{ fontWeight: '700' }}>{title}. </Text>
          {body}
        </Text>
      ))}
    </ScrollView>
  );
}
