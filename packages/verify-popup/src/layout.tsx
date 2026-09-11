import type { CSSProperties, ReactNode } from "react"

export function Frame({ children }: { children: ReactNode }) {
  return <div style={styles.frame}>{children}</div>
}

export function Notice({ children }: { children: ReactNode }) {
  return <p style={styles.notice}>{children}</p>
}

const styles: Record<string, CSSProperties> = {
  frame: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    padding: "16px 12px 24px",
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
