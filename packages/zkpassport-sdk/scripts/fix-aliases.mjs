import { replaceTscAliasPaths } from "tsc-alias"

await replaceTscAliasPaths({
  tsconfigPath: "tsconfig.json",
  resolveFullPaths: true,
  resolveFullExtension: ".js",
})
