import { replaceTscAliasPaths } from "tsc-alias"

for (const configFile of ["tsconfig.json", "tsconfig.cjs.json"]) {
  await replaceTscAliasPaths({
    configFile,
    resolveFullPaths: true,
    resolveFullExtension: ".js",
  })
}
