export type KernelEvent =
  | { type: 'root-load-started'; pubkey: string }
  | { type: 'root-load-completed'; pubkey: string; status: string }
  | { type: 'export-completed'; captureId: string; partCount: number }
  | { type: 'relay-override-applied'; relayUrls: string[] }
  | { type: 'analysis-ready'; analysisKey: string }
  | { type: 'node-expanded'; pubkey: string; followCount: number }

export type KernelEventListener = (event: KernelEvent) => void

export function createKernelEventEmitter() {
  const listeners = new Set<KernelEventListener>()

  return {
    on(listener: KernelEventListener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event: KernelEvent): void {
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}
