import { ICON_ID_CARD } from "./icons"

// Four rings of dots around an ID card. Each ring is turned a little against the
// one inside it, so the dots never line up into spokes.
const RINGS = [
  { radius: 33, count: 15, dot: 3 },
  { radius: 45, count: 20, dot: 3.4 },
  { radius: 57, count: 25, dot: 3 },
  { radius: 68, count: 30, dot: 2.4 },
]

const CENTRE = 80
/** One trip of the bright band around the ring. */
const SWEEP_SECONDS = 2.6

const DOTS = RINGS.flatMap((ring, ringIndex) =>
  Array.from({ length: ring.count }, (_, index) => {
    const turn = (index + ringIndex * 0.4) / ring.count
    const angle = turn * Math.PI * 2
    // A repeating size wobble, so the ring reads as scattered rather than drawn
    const wobble = ((index * 7) % 5) / 4
    return {
      cx: CENTRE + Math.cos(angle) * ring.radius,
      cy: CENTRE + Math.sin(angle) * ring.radius,
      r: ring.dot * (0.62 + 0.68 * wobble),
      // A negative delay starts each dot part-way in, which is what carries the
      // band around the circle
      delay: -turn * SWEEP_SECONDS,
    }
  }),
)

/** Shown while the phone works, so the wait looks like something happening. */
export function ProofLoader() {
  return (
    <div className="zkp-flow-orbit" aria-hidden="true">
      <svg viewBox="0 0 160 160">
        {DOTS.map((dot) => (
          <circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            style={{ animationDelay: `${dot.delay}s` }}
          />
        ))}
      </svg>
      <span className="zkp-flow-orbit-icon" dangerouslySetInnerHTML={{ __html: ICON_ID_CARD }} />
    </div>
  )
}
