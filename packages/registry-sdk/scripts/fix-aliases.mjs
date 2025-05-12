import { replaceTscAliasPaths } from "tsc-alias"

await replaceTscAliasPaths({
  configFile: "tsconfig.json",
  verbose: true,
  resolveFullPaths: true,
  resolveFullExtension: ".js",
})
