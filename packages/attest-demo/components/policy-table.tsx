"use client"

import type { PolicyView } from "../lib/policies"

function requirements(view: PolicyView): string {
  const parts: string[] = []
  if (view.policy.minAge > 0) parts.push(`age ≥ ${view.policy.minAge}`)
  if (view.policy.excludedCountries.length > 0)
    parts.push(`not ${view.policy.excludedCountries.join("/")}`)
  if (view.policy.sanctionsCheck) parts.push("sanctions-clear")
  if (view.policy.saltedNullifierOnly) parts.push("one-per-person")
  if (view.policy.unique) parts.push("unique")
  return parts.join(", ") || "no requirements"
}

export function PolicyTable({
  policies,
  onRetire,
  retiringId,
}: {
  policies: PolicyView[]
  onRetire?: (policyId: bigint) => void
  retiringId?: bigint
}) {
  if (policies.length === 0) return <p className="text-slate-400">No policies yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="pr-4">Policy</th>
            <th className="pr-4">Requirements</th>
            <th className="pr-4">Hook</th>
            <th className="pr-4">Status</th>
            {onRetire && <th />}
          </tr>
        </thead>
        <tbody>
          {policies.map((view) => (
            <tr key={view.policyId.toString()} className="border-t border-slate-800">
              <td className="break-all pr-4 font-mono text-xs">{view.policyId.toString()}</td>
              <td className="pr-4">{requirements(view)}</td>
              <td className="break-all pr-4 font-mono text-xs">{view.hook}</td>
              <td className="pr-4">{view.policy.retiredAt !== 0n ? "retired" : "live"}</td>
              {onRetire && (
                <td>
                  {view.policy.retiredAt === 0n && (
                    <button
                      className="rounded bg-red-800 px-2 py-1 text-xs disabled:opacity-50"
                      type="button"
                      disabled={retiringId === view.policyId}
                      onClick={() => onRetire(view.policyId)}
                    >
                      Retire
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
