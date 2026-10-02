# ZKPassport Sanctions

Builds the ZKPassport sanctions tree from OpenSanctions data: parses
[FollowTheMoney](https://followthemoney.tech) exports, performs ICAO 9303 transliteration and MRZ
formatting.

Four families of leaves are computed with Poseidon2 over the MRZ bytes of each sanctioned person:

| Family                        | Preimage                                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| name                          | the 39-character name field                                      |
| name ‖ date of birth          | name field followed by `YYMMDD`                                  |
| name ‖ year of birth          | name field followed by the two-digit year                        |
| document number ‖ nationality | 9-character document number followed by the 3-letter nationality |

The resulting Merkle tree is meant to be used by the Sanctions Registry. The sanctions circuit
proves that the hashes it recomputes from a passport's MRZ are absent from the tree.

## Installation

```bash
bun i @zkpassport/sanctions
```

## Usage

```typescript
import { buildSanctionsLeaves, extractAllPersons, parseFtmEntities } from "@zkpassport/sanctions"
import { buildSanctionsTree, nodeToHex } from "@zkpassport/utils"

const entities = parseFtmEntities(await Bun.file("us_ofac_sdn.ftm.json").text())
const { persons, dropped } = extractAllPersons(entities)
const { leaves } = await buildSanctionsLeaves(persons)
// The depth the sanctions circuit is compiled for; the registry records it as its tree height
const tree = await buildSanctionsTree(leaves, 18)
console.log(nodeToHex(tree.root), tree.leaves.length, "leaves;", dropped.length, "names dropped")
```

`createPackagedSanctionsFile` builds the same tree and wraps its root and leaves, together with one
record per upstream snapshot, in the packaged sanctions file the sanctions publisher uploads with
each root. The file's type and the checks a client runs on a downloaded file
(`checkPackagedSanctionsFileShape`, `calculatePackagedSanctionsRoot`) are in `@zkpassport/utils`.

## Pipeline

`src/parser/` is specific to OpenSanctions: it turns FollowTheMoney entities into `SanctionsPerson`
records with MRZ-ready names. `tree-builder.ts` does not depend on it: it turns `SanctionsPerson`
records into leaves and the leaves into the tree, whatever produced the records.

1. **FollowTheMoney parsing** (`parser/ftm.ts`). One entity per line; every property is a list of
   strings.
2. **Person extraction** (`parser/persons.ts`). `Person` entities only. The full-name variants are
   the `name` values plus every combination of `firstName`, `middleName`, `secondName` and
   `lastName`. Each variant and each name part is transliterated into the MRZ alphabet; a value that
   still contains characters outside A-Z, space and hyphen is reported in `dropped` rather than
   emitted. Birth dates keep the source precision (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`). Country lists
   are sorted so the output is a pure function of the input.
3. **Transliteration** (`parser/transliteration.ts`). ICAO Doc 9303 Part 3, §6: Latin letters with
   diacritics and ligatures, Cyrillic and Arabic, applied after NFKC normalisation and upper-casing
   so decomposed accents, Arabic presentation forms and case never matter. Format characters
   (bidirectional controls, tatweel) and combining marks (Arabic vowel signs) are removed;
   punctuation follows Part 3 §4.6: apostrophes join the parts around them, commas separate
   components, everything else is omitted without a filler; a teh marbuta at the end of a word is
   `XAH`. Scripts ICAO gives no table for (Greek, Hebrew, Georgian, CJK) are not transliterated:
   such a name variant is reported as dropped and the person's Latin variants still enter the tree.
4. **MRZ layout and leaves** (`tree-builder.ts`). Each attribute is written as its ICAO Doc 9303
   Part 4 TD3 field with the MRZ writers of `@zkpassport/utils`: `PRIMARY<<SECONDARY` padded with
   `<` to 39 characters (spaces and hyphens become `<`), `YYMMDD`, a 9-character document number and
   a 3-letter nationality. Four Poseidon2 families: name; name ‖ date of birth; name ‖ year of
   birth; document number ‖ nationality. The byte layout of each family comes from the leaf preimage
   functions of `@zkpassport/utils`, which the verifier uses too.
5. **Tree and packaged file** (`buildSanctionsTree` in `@zkpassport/utils`,
   `createPackagedSanctionsFile` in `tree-builder.ts`). The leaves of all four families, sorted and
   deduplicated, in an `AsyncOrderedMT` of the caller's depth. The tree exposes its sorted leaves
   and root; reading a published tree back is `AsyncOrderedMT.fromSerialized`.

## Scripts and transliteration policy

A script is transliterated when the passports of the states that use it carry a deterministic
romanisation that can be reproduced from the characters alone. Today that is the three ICAO Doc 9303
Part 3 tables: Latin with diacritics, Cyrillic and Arabic.

| Script                  | Status             | Reason                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latin, Cyrillic, Arabic | transliterated     | ICAO 9303-3 §6 tables                                                                                                                                                                                                                                    |
| Greek                   | not transliterated | ICAO has no table. Greek and Cypriot passports use ELOT 743 (ISO 843), a context-sensitive transcription that is reproducible and could be added; in current sources every Greek-named entity also carries Latin names, so there is nothing to gain yet. |
| Georgian                | not transliterated | No ICAO table; a national romanisation exists (2002) and could be added if a Georgian-only entity appears.                                                                                                                                               |
| Hebrew, Korean          | not transliterated | Passports carry the holder's chosen spelling; no deterministic rule to reproduce.                                                                                                                                                                        |
| CJK                     | not transliterated | PRC passports use pinyin, which needs a character-reading dictionary; Taiwan and Hong Kong differ.                                                                                                                                                       |

Name variants in an untransliterated script are reported in `dropped`. An entity whose every name is
in such a script is reported in `uncovered`; a publisher must treat a non-empty `uncovered` list as
a failure, because that person would otherwise be silently absent from the tree. When that failure
happens, the fix is to add a transliteration for the script in question (following the policy
above), not to skip the entity.

## Tests

```bash
bun test
```

The tests are written against the specifications (ICAO 9303 Parts 3 and 4, the FollowTheMoney Person
schema).
