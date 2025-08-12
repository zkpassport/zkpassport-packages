"use client"

import { NavLink } from "@/components/NavLink"
import { ThemeToggle } from "@/components/ThemeToggle"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header className="border-b border-border">
      <div className="container mx-auto p-4">
        {/* Desktop header */}
        <div className="hidden md:flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <Image src="/favicon.png" alt="ZKPassport" width={26} height={26} />
              <span className="whitespace-nowrap text-xs sm:text-base md:text-lg">
                ZKPassport Registry Explorer
              </span>
            </Link>
          </div>
          <nav className="flex items-center gap-4">
            <NavLink href="/map">Map</NavLink>
            <NavLink href="/certificates">Certificates</NavLink>
            <NavLink href="/certificates/history">Certificate Roots</NavLink>
            <NavLink href="/circuits/history">Circuit Roots</NavLink>
            <NavLink href="/overview">Overview</NavLink>
            <ThemeToggle />
          </nav>
        </div>

        {/* Mobile header */}
        <div className="md:hidden">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center gap-2 font-bold" onClick={closeMobileMenu}>
              <Image src="/favicon.png" alt="ZKPassport" width={24} height={24} />
              <span className="text-sm">ZKPassport Registry Explorer</span>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-md hover:bg-muted transition-colors duration-200"
                aria-label="Toggle mobile menu"
              >
                <div className="w-6 h-6 flex flex-col justify-center items-center space-y-1">
                  <span
                    className={`block w-5 h-0.5 bg-current transform transition-all duration-500 ease-in-out origin-center ${
                      mobileMenuOpen
                        ? "rotate-45 translate-y-1.5 scale-110"
                        : "rotate-0 translate-y-0 scale-100"
                    }`}
                  />
                  <span
                    className={`block w-5 h-0.5 bg-current transform transition-all duration-300 ease-in-out ${
                      mobileMenuOpen ? "opacity-0 scale-75" : "opacity-100 scale-100"
                    }`}
                  />
                  <span
                    className={`block w-5 h-0.5 bg-current transform transition-all duration-500 ease-in-out origin-center ${
                      mobileMenuOpen
                        ? "-rotate-45 -translate-y-1.5 scale-110"
                        : "rotate-0 translate-y-0 scale-100"
                    }`}
                  />
                </div>
              </button>
            </div>
          </div>

          {/* Mobile navigation menu */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              mobileMenuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <nav className="pt-4 pb-2 space-y-2">
              <NavLink
                href="/certificates"
                className="block py-3 px-2 rounded-md hover:bg-muted transition-colors"
                onClick={closeMobileMenu}
              >
                Certificates
              </NavLink>
              <NavLink
                href="/certificates/history"
                className="block py-3 px-2 rounded-md hover:bg-muted transition-colors"
                onClick={closeMobileMenu}
              >
                Certificate Roots
              </NavLink>
              <NavLink
                href="/circuits/history"
                className="block py-3 px-2 rounded-md hover:bg-muted transition-colors"
                onClick={closeMobileMenu}
              >
                Circuit Roots
              </NavLink>
              <NavLink
                href="/overview"
                className="block py-3 px-2 rounded-md hover:bg-muted transition-colors"
                onClick={closeMobileMenu}
              >
                Overview
              </NavLink>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
