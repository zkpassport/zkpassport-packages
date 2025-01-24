import { ZkPassportProver } from "../src/mobile"
import { ZKPassport, SANCTIONED_COUNTRIES } from "../src/index"
import { customLogger as logger } from "../src/logger"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

if (process.argv.length < 3) {
  console.error("Usage: bun run scripts/simulate.ts mobile|frontend")
  process.exit(1)
}

async function main() {
  if (process.argv[2] === "mobile") {
    const zkPassportProver = new ZkPassportProver()

    const scannedUrl =
      "https://zkpassport.id/r?d=localhost&t=abc456&p=02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4"

    const { onDomainVerified, notifyAccept, notifyReject, notifyDone } =
      await zkPassportProver.scan(scannedUrl, {
        keyPairOverride: {
          privateKey: new Uint8Array([
            90, 246, 191, 146, 154, 179, 181, 226, 245, 114, 8, 4, 190, 198, 230, 242, 30, 43, 221,
            195, 89, 211, 59, 55, 174, 189, 59, 205, 197, 94, 216, 14,
          ]),
          publicKey: new Uint8Array([
            3, 202, 45, 95, 176, 97, 188, 130, 46, 26, 69, 197, 152, 237, 220, 8, 6, 156, 55, 254,
            254, 9, 96, 71, 169, 10, 127, 249, 203, 125, 180, 136, 170,
          ]),
        },
      })

    // Once the domain is verified, the accept button can be enabled, allowing the user to generate a proof
    onDomainVerified(async () => {
      logger.info("Website domain verified!")
      notifyAccept()
      await sleep(3000)
      notifyDone({
        inputs: {
          country: "AUS",
          firstName: "Michael",
        },
      })
      // notifyReject()
    })
  } else if (process.argv[2] === "frontend") {
    const zkPassport = new ZKPassport("https://localhost")
    const queryBuilder = await zkPassport.request({
      name: "My Service",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "Asking for random stuff",
      keyPairOverride: {
        privateKey: new Uint8Array([
          175, 240, 91, 237, 236, 122, 175, 26, 224, 150, 40, 191, 129, 171, 80, 203, 2, 85, 135,
          222, 41, 239, 153, 214, 94, 222, 43, 145, 55, 168, 230, 253,
        ]),
        publicKey: new Uint8Array([
          2, 211, 255, 94, 93, 183, 196, 140, 52, 136, 11, 193, 30, 139, 69, 122, 75, 154, 107, 242,
          162, 245, 69, 207, 87, 94, 185, 65, 176, 143, 4, 173, 196,
        ]),
      },
      topicOverride: "abc456",
    })

    const {
      url,
      requestId,
      onRequestReceived,
      onGeneratingProof,
      onProofGenerated,
      onReject,
      onError,
    } = queryBuilder
      .eq("fullname", "John Doe")
      .range("age", 18, 25)
      .in("nationality", ["USA", "GBR", "Germany", "Canada", "Portugal"])
      .out("nationality", SANCTIONED_COUNTRIES)
      .done()

    console.log(url)

    onRequestReceived(() => {
      logger.info("Request received (QR code scanned)")
    })

    onGeneratingProof(() => {
      logger.info("Generating proof")
    })

    onProofGenerated((proof) => {
      logger.info("Proof generated", proof)
    })

    onReject(() => {
      logger.info("User rejected")
    })

    onError((error) => {
      logger.error("Error", error)
    })
  }
}

main()
