// NIP-07 window.nostr type definitions
interface NostrEvent {
  id?: string;
  pubkey?: string;
  created_at?: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

interface Nip04 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

interface NostrWindow {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<NostrEvent>;
  getRelays?(): Promise<{ [url: string]: { read: boolean; write: boolean } }>;
  nip04?: Nip04;
}

interface WebLnProvider {
  enable(): Promise<void>;
  sendPayment(paymentRequest: string): Promise<unknown>;
}

declare global {
  interface Window {
    nostr?: NostrWindow;
    webln?: WebLnProvider;
  }
}

export {};
