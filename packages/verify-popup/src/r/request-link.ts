export type VerifyRequest = {
  serviceName: string | null
  domain: string | null
}

/** Reads a request link's search params; null when this is not a request link. */
export function parseVerifyRequest(search: string): VerifyRequest | null {
  const params = new URLSearchParams(search)
  if (!params.get("t") || !params.get("p")) return null
  return {
    serviceName: parseServiceName(params.get("s")),
    domain: params.get("d"),
  }
}

function parseServiceName(serviceParam: string | null): string | null {
  if (!serviceParam) return null
  try {
    // URL decoding turns "+" into a space; put it back before reading the base64
    const base64 = serviceParam.replace(/ /g, "+")
    const jsonBytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const service = JSON.parse(new TextDecoder().decode(jsonBytes))
    return typeof service?.name === "string" && service.name ? service.name : null
  } catch {
    return null
  }
}
