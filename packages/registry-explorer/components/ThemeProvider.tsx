"use client"

import { createContext, ReactNode, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

interface ThemeContextType {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as Theme
    if (storedTheme) {
      setTheme(storedTheme)
    } else {
      setTheme("system")
    }
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    const applied: ResolvedTheme = theme === "system" ? getSystemTheme() : theme

    root.classList.remove("light", "dark")
    root.classList.add(applied)
    setResolvedTheme(applied)
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      const root = window.document.documentElement
      const applied: ResolvedTheme = getSystemTheme()
      root.classList.remove("light", "dark")
      root.classList.add(applied)
      setResolvedTheme(applied)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setThemeWithStorage = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme)
    setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: setThemeWithStorage }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
