import { NextRequest, NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"

/**
 * Development-only API route that serves packaged certificate files by root hash
 * Route: /certificates/:root/
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { root: string } },
): Promise<NextResponse> {
  const { root } = params
  // Only serve in development mode
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 })
  }

  // Validate the root parameter to prevent path traversal
  if (!root || !/^(0x)?[a-f0-9]+$/i.test(root)) {
    return NextResponse.json({ error: "Invalid root hash format" }, { status: 400 })
  }

  try {
    const filePath = path.join("public/assets/certificates/", `certificates.json`)

    // Read the file
    const fileContents = await fs.readFile(filePath, "utf-8")
    const certificateData = JSON.parse(fileContents)

    // Set appropriate headers
    const headers = new Headers()
    headers.set("Content-Type", "application/json")
    headers.set("Cache-Control", "public, max-age=3600") // Cache for 1 hour

    // Return the certificate data
    return NextResponse.json(certificateData, { headers })
  } catch (error) {
    console.error("Error reading certificate file:", error)
    return NextResponse.json({ error: "Failed to process certificate data" }, { status: 500 })
  }
}
