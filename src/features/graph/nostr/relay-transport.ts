import { Relay, type Filter } from 'nostr-tools'

import type {
  RelayConnection,
  RelayCountRequestOptions,
  RelaySubscribeHandlers,
  RelaySubscriptionHandle,
  RelayTransport,
} from './types'

class NostrToolsRelayConnection implements RelayConnection {
  readonly url: string

  private readonly noticeListeners = new Set<(message: string) => void>()
  private readonly closeListeners = new Set<() => void>()
  private readonly relay: Relay

  constructor(relay: Relay) {
    this.relay = relay
    this.url = relay.url
    relay.onnotice = (message) => {
      for (const listener of this.noticeListeners) {
        listener(message)
      }
    }
    relay.onclose = () => {
      for (const listener of this.closeListeners) {
        listener()
      }
    }
  }

  subscribe(
    filters: Filter[],
    handlers: RelaySubscribeHandlers,
  ): RelaySubscriptionHandle {
    if (!this.isOpen()) {
      throw new Error(`Relay ${this.url} is not open.`)
    }

    const subscription = this.relay.subscribe(filters, {
      onevent: handlers.onEvent,
      oneose: handlers.onEose,
      onclose: handlers.onClose,
    })

    let closed = false

    return {
      close: (reason?: string) => {
        if (closed || !this.isOpen()) {
          closed = true
          return
        }

        closed = true
        subscription.close(reason)
      },
    }
  }

  async count(
    filters: Filter[],
    options: RelayCountRequestOptions = {},
  ): Promise<number> {
    if (!this.isOpen()) {
      throw new Error(`Relay ${this.url} is not open.`)
    }

    return this.relay.count(filters, options)
  }

  onNotice(listener: (message: string) => void): () => void {
    this.noticeListeners.add(listener)
    return () => {
      this.noticeListeners.delete(listener)
    }
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }

  isOpen(): boolean {
    return this.getReadyState() === this.getOpenReadyState()
  }

  private getReadyState(): number | undefined {
    const relayState = this.relay as unknown as {
      ws?: { readyState?: number }
    }

    return relayState.ws?.readyState
  }

  private getNativeSocket(): WebSocket | undefined {
    const relayState = this.relay as unknown as {
      ws?: WebSocket
    }

    return relayState.ws
  }

  private getOpenReadyState(): number {
    return typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1
  }

  close(): void {
    const socket = this.getNativeSocket()
    const openReadyState = this.getOpenReadyState()
    const connectingReadyState =
      typeof WebSocket !== 'undefined' ? WebSocket.CONNECTING : 0

    if (
      !socket ||
      (socket.readyState !== openReadyState &&
        socket.readyState !== connectingReadyState)
    ) {
      return
    }

    const relayState = this.relay as unknown as {
      skipReconnection?: boolean
    }
    relayState.skipReconnection = true
    socket.close()
  }
}

export class NostrToolsRelayTransport implements RelayTransport {
  async connect(url: string): Promise<RelayConnection> {
    const relay = new Relay(url)
    await relay.connect()
    return new NostrToolsRelayConnection(relay)
  }
}
