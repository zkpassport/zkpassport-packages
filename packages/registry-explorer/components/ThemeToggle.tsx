"use client"

import { useTheme } from "@/components/ThemeProvider"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-full transition-opacity duration-500 ease-in-out"
            aria-label="Toggle theme"
            style={{
              visibility: mounted ? "visible" : "hidden",
              opacity: mounted ? 1 : 0,
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5 text-yellow-300" />
            ) : (
              <Moon className="h-5 w-5 text-gray-600" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
