import { DebugInitializer } from "@/components/DebugInitializer"
import { ThemeProvider } from "@/components/ThemeProvider"
import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { Navigation } from "@/components/Navigation"

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

const title = "ZKPassport Registry Explorer"
const description = "Explore the ZKPassport certificate and circuit registries"
const url = "https://registry.zkpassport.id"
const ogimage = "/og.png"
const sitename = "registry.zkpassport.id"

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.png",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: url,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
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
          <Navigation />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
