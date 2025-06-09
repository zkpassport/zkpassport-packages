"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavLinkProps {
  href: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function NavLink({ href, children, className, onClick }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        isActive ? "text-foreground" : "hover:text-foreground/80 text-foreground/60"
      } ${className || ""}`}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
