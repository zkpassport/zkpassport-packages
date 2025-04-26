import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { ThemeProvider } from "@/components/ThemeProvider"
import { ThemeToggle } from "@/components/ThemeToggle"
import Link from "next/link"
import { NavLink } from "@/components/NavLink"
import { DebugInitializer } from "@/components/DebugInitializer"

const mrzFont = localFont({
  src: "./fonts/OCR-B.ttf",
  variable: "--font-mrz",
})

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "ZKPassport Registry Explorer",
  description: "Explore the ZKPassport certificate and circuit registries",
  icons: {
    icon: "/favicon.png",
  },
}

// Theme initialization script to be run on the client
const themeScript = `
  (function() {
    function getThemePreference() {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
        return localStorage.getItem('theme');
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    const theme = getThemePreference();
    document.documentElement.classList.add(theme);
  })();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${mrzFont.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DebugInitializer />
        <ThemeProvider>
          <header className="border-b border-border">
            <div className="container mx-auto p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Link href="/" className="font-bold text-lg">
                  ZKPassport Registry Explorer
                </Link>
              </div>
              <nav className="flex items-center gap-4">
                <NavLink href="/certificates">Certificates</NavLink>
                <NavLink href="/history">Historical Roots</NavLink>
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
