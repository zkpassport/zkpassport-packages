export class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  onopen: (() => void) | null = null
  onmessageHandlers: ((event: { data: string }) => void)[] | null = null
  private readyState: number
  private url: string
  public origin: string

  constructor(url: string, { headers }: { headers?: Record<string, string> } = {}) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.origin = headers?.Origin || '?'

    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) this.onopen()
    }, 1)
  }

  send(data: string) {
    console.log('(' + this.origin + ') WebSocket send()', data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    console.log('(' + this.origin + ') WebSocket close()')
  }

  addEventListener(event: string, callback: ((event: { data: string }) => void) | (() => void)) {
    if (event === 'open') {
      this.onopen = callback as () => void
    } else if (event === 'message') {
      if (!this.onmessageHandlers) {
        this.onmessageHandlers = []
      }
      this.onmessageHandlers.push(callback)
    }
  }

  getReadyState() {
    return this.readyState
  }
}
