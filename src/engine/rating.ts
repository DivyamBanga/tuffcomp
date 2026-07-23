import { computeBalance } from './balance'
import { computeChemistry } from './chemistry'
import { summarize } from './explain'
import { computeFit } from './fit'
import { clamp } from './math'
import { computeQuality } from './quality'
import type { BuiltTeam } from './team'

// Quality matters most, but fit, chemistry, and balance together outweigh
// it, so a smart build beats a naive all-stars build. Tunable - see
// PRD.md section 5.4.
export const RATING_WEIGHTS = {
  quality: 0.4,
  fit: 0.2,
  chemistry: 0.15,
  balance: 0.25,
}

export interface RatingBreakdown {
  rating: number
  quality: number
  fit: number
  chemistry: number
  balance: number
  summary: string
}

// Pure function: works on a team of any size (0 to 11), so the same engine
// powers both the live provisional rating while building and the final
// result once the XI is complete.
export function rateTeam(team: BuiltTeam): RatingBreakdown {
  const quality = computeQuality(team)
  const fit = computeFit(team)
  const chemistry = computeChemistry(team)
  const balance = computeBalance(team)

  const rating = clamp(
    Math.round(
      quality * RATING_WEIGHTS.quality +
        fit * RATING_WEIGHTS.fit +
        chemistry * RATING_WEIGHTS.chemistry +
        balance * RATING_WEIGHTS.balance,
    ),
    0,
    100,
  )

  return { rating, quality, fit, chemistry, balance, summary: summarize(team, quality) }
}
