import type { PackagedCertificatesFile } from "@zkpassport/utils/types"
import type { RegistryClient } from "./client"

/**
 * For development: makes a registry client take its certificates from a packaged certificates
 * file served at `url` (as the circuits repo's `serve-circuits` serves `certificates.json`), and
 * treat that file's root as the latest valid certificate root, so certificates that are not
 * published yet can be proven and verified against. Every other root is still checked on chain.
 * When nothing is served at `url`, the client is unchanged.
 */
export function withLocalCertificates<T extends RegistryClient>(client: T, url: string): T {
  let local: Promise<PackagedCertificatesFile | null> | undefined
  const load = () =>
    (local ??= fetch(url)
      .then((response) =>
        response.ok ? (response.json() as Promise<PackagedCertificatesFile>) : null,
      )
      .catch(() => null))

  const getCertificates = client.getCertificates.bind(client)
  client.getCertificates = async (root, options) => (await load()) ?? getCertificates(root, options)

  const getLatestCertificateRoot = client.getLatestCertificateRoot.bind(client)
  client.getLatestCertificateRoot = async () => (await load())?.root ?? getLatestCertificateRoot()

  const isCertificateRootValid = client.isCertificateRootValid.bind(client)
  client.isCertificateRootValid = async (root: string, timestamp?: number) => {
    const file = await load()
    if (file && BigInt(file.root) === BigInt(root.startsWith("0x") ? root : `0x${root}`)) {
      return true
    }
    return isCertificateRootValid(root, timestamp)
  }
  return client
}
