import { HIDDEN_NOTE } from "../lib/disclosure"

export function Disclosure({ domain, claims }: { domain: string; claims: string[] }) {
  return (
    <section className="w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Verification for {domain}</h1>
      {claims.length > 0 ? (
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">This proves only that:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-slate-300">This policy has no disclosure requirements.</p>
      )}
      <p className="text-sm text-slate-400">{HIDDEN_NOTE}</p>
    </section>
  )
}
