/**
 * Copy the compiled ZKPassportRegistry artifact into the package without its Noir sources and debug
 * symbols, or check that the copy has the compiled artifact's contract class.
 *
 *   bun scripts/registry-artifact.ts copy|check
 */
import { loadContractArtifact, type NoirCompiledContract } from "@aztec-labs/aztec.js/abi"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import { readFile, writeFile } from "node:fs/promises"

const compiledPath = new URL(
  "../../noir/target/zkpassport_registry_contract-ZKPassportRegistry.json",
  import.meta.url,
)
const copyPath = new URL("../registry/ZKPassportRegistry.json", import.meta.url)

const mode = process.argv[2]
const compiled = JSON.parse(await readFile(compiledPath, "utf8")) as NoirCompiledContract

if (mode === "copy") {
  // PXEs need neither the Noir sources nor the debug symbols, which make the artifact too large for
  // the repository. aztec.js requires each function's debug_symbols to be a string, so it's empty.
  const copy = {
    ...compiled,
    file_map: {},
    functions: compiled.functions.map((fn) => ({ ...fn, debug_symbols: "" })),
  }
  await writeFile(copyPath, JSON.stringify(copy))
  console.log(`Wrote ${copyPath.pathname}`)
} else if (mode === "check") {
  const copy = JSON.parse(await readFile(copyPath, "utf8")) as NoirCompiledContract
  const [compiledClass, copyClass] = await Promise.all(
    [compiled, copy].map(async (json) =>
      (await getContractClassFromArtifact(loadContractArtifact(json))).id.toString(),
    ),
  )
  if (compiledClass !== copyClass) {
    console.error(
      `registry/ZKPassportRegistry.json is class ${copyClass}, the compiled registry ${compiledClass}: run bun scripts/registry-artifact.ts copy`,
    )
    process.exit(1)
  }
  console.log(`registry/ZKPassportRegistry.json matches the compiled registry, class ${copyClass}`)
} else {
  console.error("Usage: bun scripts/registry-artifact.ts copy|check")
  process.exit(1)
}
