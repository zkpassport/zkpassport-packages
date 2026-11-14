import type { PackagedCertificatesFile } from "@zkpassport/utils/types"
import type { RegistryClient } from "./client"

/** Development only: trusts the root of the certificates file served at `url` */
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
