import { useState, useEffect } from "react"

type Theme = "light" | "dark" | "system"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system")

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

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"

      root.classList.remove("light", "dark")
      root.classList.add(systemTheme)
      return
    }

    root.classList.remove("light", "dark")
    root.classList.add(theme)
  }, [theme])

  const setThemeWithStorage = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme)
    setTheme(newTheme)
  }

  return {
    theme,
    setTheme: setThemeWithStorage,
  }
}
