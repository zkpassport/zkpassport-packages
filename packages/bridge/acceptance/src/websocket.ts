// Import type only to avoid bundling issues
import type { WebSocket as WSWebSocket } from "ws"

/**
 * Detects if code is running in a server-side JavaScript environment
 * (Node.js, Bun, Deno, or other server-side runtimes)
 *
 * @returns true if running in a server-side environment, false if in browser
 */
export function isNodeEnvironment(): boolean {
  // Check for server-side runtime characteristics
  return (
    // Process object with versions (Node.js, Bun, and most server runtimes)
    typeof process !== "undefined" &&
    process.versions != null &&
    // Absence of browser-specific window object
    typeof window === "undefined"
  )
}

/**
 * Creates a WebSocket client that works in both browser and Node.js environments
 */
export async function getWebSocketClient(url: string, origin?: string): Promise<WebSocket | WSWebSocket> {
  // If running in a Node.js or server-side environment use the ws package (allows custom origin)
  if (isNodeEnvironment()) {
    try {
      // Dynamic import of the ws module
      const wsModule = await import("ws").catch(() => {
        // Fallback to require for CommonJS environments
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return { default: require("ws") }
        } catch {
          throw new Error("WebSocket implementation 'ws' not found. Please install it with: npm install ws")
        }
      })
      // Get the WebSocket constructor
      const WebSocketImpl = wsModule.default || (wsModule as any).WebSocket || wsModule
      return new WebSocketImpl(url, { headers: { Origin: origin || "nodejs" } }) as WSWebSocket
    } catch (error) {
      console.error("Failed to create WebSocket client:", error)
      throw new Error("WebSocket implementation 'ws' not found. Please install it with: npm install ws")
    }
  }
  // Otherwise use native WebSocket
  return new WebSocket(url)
}

// WebSocketClient type
export type WebSocketClient = Awaited<ReturnType<typeof getWebSocketClient>>
