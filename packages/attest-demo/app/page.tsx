import Link from "next/link"

const PERSONAS = [
  { href: "/creator", title: "Creator", blurb: "Define a policy on the registry" },
  { href: "/launcher", title: "Launcher", blurb: "Deploy a gated MockAuction and share links" },
  { href: "/bidder", title: "Bidder", blurb: "Verify with ZKPassport and place a bid" },
  { href: "/holder", title: "Holder", blurb: "Inspect and revoke your own credentials" },
  { href: "/guardian", title: "Guardian", blurb: "Revoke any wallet's credential" },
]

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">ZKPassport Attest Demo</h1>
      <p className="text-slate-300">
        One page per persona. Follow them top to bottom for the full story.
      </p>
      <ul className="space-y-3">
        {PERSONAS.map((p) => (
          <li key={p.href}>
            <Link
              className="block rounded border border-slate-700 p-4 hover:border-sky-500"
              href={p.href}
            >
              <span className="font-medium">{p.title}</span>
              <span className="ml-2 text-sm text-slate-400">{p.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
