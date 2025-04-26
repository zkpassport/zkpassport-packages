import { execSync } from "child_process"

const isWatchMode = process.argv.includes("--watch")

function generateTypes() {
  try {
    const command = `tsc --declaration --emitDeclarationOnly ${isWatchMode ? "--watch " : " "}--project tsconfig.json --outDir dist`
    if (isWatchMode) {
      // Run and watch
      const proc = execSync(command)
      proc.stdout.pipe(process.stdout)
      proc.stderr.pipe(process.stderr)
    } else {
      // Run once
      const { stdout, stderr } = execSync(command)
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
      console.log("Type declarations generated successfully")
    }
  } catch (error) {
    console.error("❌ Error generating type declarations:", error.message)
    process.exit(1)
  }
}

generateTypes()
