import type { PackagedSanctionsFile } from "@zkpassport/utils"
import {
  extractAllPersons,
  parseFtmEntities,
  type SanctionsPerson,
} from "@zkpassport/utils/sanctions"
import { SEPOLIA_SANCTIONS_URL } from "./chain-fork"

/**
 * A person from the OFAC SDN build behind one of Sepolia's sanctions roots whose name and date of
 * birth fit a TD3 MRZ as they are: one given name, one family name, both plain A-Z, and a full
 * date of birth.
 */
export async function findListedPerson(sanctionsRoot: string): Promise<SanctionsPerson> {
  const packaged: PackagedSanctionsFile = await (
    await fetchOk(`${SEPOLIA_SANCTIONS_URL}/${sanctionsRoot}.json`)
  ).json()
  const ofac = packaged.sources.find((source) => source.dataset === "us_ofac_sdn")
  if (!ofac) {
    throw new Error(`No us_ofac_sdn build behind sanctions root ${sanctionsRoot}`)
  }

  const { persons } = extractAllPersons(parseFtmEntities(await (await fetchOk(ofac.url)).text()))
  const person = persons.find(
    (candidate) =>
      candidate.firstNames.length === 1 &&
      candidate.lastNames.length === 1 &&
      /^[A-Z]{3,15}$/.test(candidate.firstNames[0]) &&
      /^[A-Z]{3,15}$/.test(candidate.lastNames[0]) &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate.birthDate ?? ""),
  )
  if (!person) {
    throw new Error(`No person with a simple name and a full date of birth in ${ofac.url}`)
  }
  return person
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`)
  }
  return response
}
