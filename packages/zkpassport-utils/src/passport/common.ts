import { getOIDName } from ".."

export function formatDN(issuer: any[]): string {
  return issuer
    .map((i) =>
      i
        .map(
          (j: { type: string; value: { toString: () => any } }) =>
            `${getOIDName(j.type)}=${j.value.toString()}`,
        )
        .join(", "),
    )
    .join(", ")
}
