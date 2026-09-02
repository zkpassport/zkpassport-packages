import { NextResponse, type NextRequest } from "next/server"
import { checkBasicAuth } from "./lib/basic-auth"

export function middleware(request: NextRequest) {
  const allowed = checkBasicAuth(
    request.headers.get("authorization"),
    process.env.BASIC_AUTH_CREDENTIALS,
  )
  if (allowed) {
    return NextResponse.next()
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="attest-demo"' },
  })
}
