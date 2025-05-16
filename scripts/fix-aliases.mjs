import { replaceTscAliasPaths } from "tsc-alias"

await replaceTscAliasPaths({
  configFile: "tsconfig.json",
  resolveFullPaths: true,
  resolveFullExtension: ".js",
})
