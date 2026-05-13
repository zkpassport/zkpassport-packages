import QRCode from "qrcode"

/**
 * Render the bridge URL as an SVG QR code string.
 *
 * Error correction level H tolerates ~30% damage, which is what makes the
 * center logo overlay safe to put on top (the logo is positioned absolutely
 * in the DOM, not embedded in this SVG — see `mount()` for that).
 *
 * `margin: 0` strips the default 4-module quiet zone; the card adds its own
 * padding via CSS, so we want the SVG to fill its slot edge-to-edge.
 */
export async function generateSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 0,
  })
}
