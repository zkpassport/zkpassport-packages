import { execSync } from "child_process"
import fs from "fs"
import path from "path"

const isWatchMode = process.argv.includes("--watch")

// Function to fix path aliases in declaration files
function fixPathAliases() {
  // Find all .d.ts files in the dist directory
  const processDir = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    for (const file of files) {
      const filePath = path.join(dir, file.name)
      if (file.isDirectory()) {
        processDir(filePath)
      } else if (file.name.endsWith(".d.ts")) {
        let content = fs.readFileSync(filePath, "utf8")
        // Replace @/* paths with relative paths
        content = content.replace(/from\s+["']@\/(.+?)["']/g, (match, importPath) => {
          // Calculate the relative path from the current file to src directory
          const relativeToSrc = path.relative(path.dirname(filePath), "dist")
          // Use proper relative path
          const relativePath = relativeToSrc
            ? `./${relativeToSrc}/${importPath}`
            : `./${importPath}`
          return `from "${relativePath}"`
        })
        fs.writeFileSync(filePath, content)
      }
    }
  }
  processDir("dist")
}

function generateTypes() {
  try {
    const command = `tsc --declaration --emitDeclarationOnly ${isWatchMode ? "--watch " : " "}--project tsconfig.json --outDir dist`
    if (isWatchMode) {
      // Run and watch
      const proc = execSync(command)
      proc.stdout.pipe(process.stdout)
      proc.stderr.pipe(process.stderr)
      // Note: In watch mode, we can't easily run the fixPathAliases function after each change
      console.warn("Warning: Path aliases in type declarations may not be fixed in watch mode")
    } else {
      // Run once
      execSync(command, { stdio: "inherit" })
      console.log("Type declarations generated successfully")
      // Fix path aliases in the generated type declarations
      fixPathAliases()
    }
  } catch (error) {
    console.error("❌ Error generating type declarations:", error.message)
    process.exit(1)
  }
}

generateTypes()
