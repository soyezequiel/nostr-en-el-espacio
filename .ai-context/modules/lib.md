# Modulo: lib

> Generado por la capa deterministica de context-artifact-generator.

## Responsabilidad
Agrupa el contexto deterministico de lib para archivos bajo src/lib.

## Archivos Propios
- src/lib/media.ts
- src/lib/nostr.ts

## Hashes Fuente
- src/lib/media.ts: bdd34b112de4
- src/lib/nostr.ts: 5652305f936e

## Simbolos Exportados
- funcion getInitials getInitials(value: string | undefined, fallback = 'N'): string (src/lib/media.ts)
- funcion normalizeMediaUrl normalizeMediaUrl(value: unknown): string | undefined (src/lib/media.ts)
- funcion connectNDK connectNDK(): Promise<NDK> (src/lib/nostr.ts)
- funcion createNostrConnectSession createNostrConnectSession(relay?: string): Promise<NostrConnectSession> (src/lib/nostr.ts)
- funcion fetchFollowers fetchFollowers(pubkey: string): Promise<string[]> (src/lib/nostr.ts)
- funcion fetchFollowing fetchFollowing(pubkey: string): Promise<string[]> (src/lib/nostr.ts)
- funcion fetchProfileByPubkey fetchProfileByPubkey(pubkey: string): Promise<NostrProfile> (src/lib/nostr.ts)
- funcion fetchUserNotes fetchUserNotes(pubkey: string, limit = 20): Promise<NDKEvent[]> (src/lib/nostr.ts)
- funcion formatPubkey formatPubkey(pubkey: string): string (src/lib/nostr.ts)
- funcion formatTimestamp formatTimestamp(timestamp: number): string (src/lib/nostr.ts)
- funcion getNDK getNDK(): NDK (src/lib/nostr.ts)
- tipo LoginMethod (src/lib/nostr.ts)
- funcion loginWithBunker loginWithBunker(bunkerUrl: string): Promise<NDKUser | null> (src/lib/nostr.ts)
- funcion loginWithExtension loginWithExtension(): Promise<NDKUser | null> (src/lib/nostr.ts)
- funcion loginWithNsec loginWithNsec(nsec: string): Promise<NDKUser | null> (src/lib/nostr.ts)
- interfaz NostrConnectSession (src/lib/nostr.ts)
- interfaz NostrProfile (src/lib/nostr.ts)
- funcion parseProfile parseProfile(user: NDKUser): NostrProfile (src/lib/nostr.ts)
- funcion resetUserRelays resetUserRelays(): void (src/lib/nostr.ts)

## Dependencias Entrantes
- Ninguno.

## Dependencias Salientes
- external:@/lib/media
- external:@nostr-dev-kit/ndk
- external:nostr-tools

## Tests Relacionados
- Ninguno.

## Invariantes
- Generado desde un escaneo deterministico del codigo fuente y metadatos del parser.
- Los campos estructurales se actualizan corriendo de nuevo el CLI, no a mano.

## Notas de Confianza
- Ninguno.
