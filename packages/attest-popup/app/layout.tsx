import type { Metadata } from "next"
import "./globals.css"
import "@zkpassport/ui/styles.css"

export const metadata: Metadata = {
  title: "ZKPassport Verification",
  description: "Verify once, hold the credential on-chain.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
