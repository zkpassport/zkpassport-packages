import type { CSSProperties, ReactNode } from "react"

export function Frame({ children }: { children: ReactNode }) {
  return <div style={styles.frame}>{children}</div>
}

export function Notice({ children }: { children: ReactNode }) {
  return <p style={styles.notice}>{children}</p>
}

const styles: Record<string, CSSProperties> = {
  frame: {
    // The popup window is a fixed size, so the page is too: whatever a screen
    // cannot fit scrolls inside the card, never the window
    height: "100%",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    padding: "18px 18px 20px",
    boxSizing: "border-box",
  },
  notice: {
    maxWidth: 320,
    marginTop: 80,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#6b7280",
  },
}
