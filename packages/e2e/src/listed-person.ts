import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { PassportViewModel } from "@zkpassport/utils"
import { dateToMrz, formatMrzName } from "@zkpassport/utils/passport"
import {
  extractAllPersons,
  parseFtmEntities,
  type SanctionsPerson,
} from "@zkpassport/utils/sanctions"

/**
 * A person from a downloaded OpenSanctions snapshot whose name and date of birth fit a TD3 MRZ
 * as they are: one given name, one family name, both plain A-Z, and a full date of birth.
 */
export function findListedPerson(snapshotsDir: string, dataset: string): SanctionsPerson {
  const dir = join(snapshotsDir, dataset)
  const newest = readdirSync(dir)
    .filter((file) => file.endsWith(".ftm.json"))
    .sort()
    .at(-1)
  if (!newest) {
    throw new Error(`No ${dataset} snapshot in ${snapshotsDir}`)
  }

  const { persons } = extractAllPersons(parseFtmEntities(readFileSync(join(dir, newest), "utf8")))
  const person = persons.find(
    (candidate) =>
      candidate.firstNames.length === 1 &&
      candidate.lastNames.length === 1 &&
      /^[A-Z]{3,15}$/.test(candidate.firstNames[0]) &&
      /^[A-Z]{3,15}$/.test(candidate.lastNames[0]) &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate.birthDate ?? ""),
  )
  if (!person) {
    throw new Error(`No person with a simple name and a full date of birth in ${newest}`)
  }
  return person
}

/**
 * The MRZ side of a passport for a listed person: their name and date of birth on a mock UTO
 * passport. Only the MRZ is filled in, which is all the sanctions inputs read; there is no SOD,
 * so nothing can be proved with it.
 */
export function listedPersonPassport(person: SanctionsPerson): PassportViewModel {
  const line1 = `P<UTO${formatMrzName(person.lastNames[0], person.firstNames[0])}`
  const line2 = `L898902C36UTO${dateToMrz(person.birthDate!)}1M3501011<<<<<<<<<<<<<<00`
  return { mrz: line1 + line2 } as PassportViewModel
}
