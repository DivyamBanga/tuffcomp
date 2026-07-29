import { useState, type ReactNode } from 'react'
import type { Card } from '../types'
import { headshotUrl } from '../types'

// ------------------------------------------------------------- LED ticker

export function LedTicker({ text }: { text: string }) {
  const repeated = `${text} · `.repeat(6)
  return (
    <div className="led-strip overflow-hidden py-1.5">
      <div className="animate-marquee flex w-max whitespace-nowrap font-led text-[11px] font-bold tracking-[0.35em] text-neon/90">
        <span>{repeated}</span>
        <span>{repeated}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ arcade bits

export function NeonButton({
  children,
  onClick,
  disabled,
  color = 'neon',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  color?: 'neon' | 'ember' | 'ice' | 'steel'
  className?: string
}) {
  const palette: Record<string, string> = {
    neon: 'bg-neon text-arena',
    ember: 'bg-ember text-chalk',
    ice: 'bg-ice text-arena',
    steel: 'bg-bezel text-chalk',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn-arcade px-6 py-3 text-xl ${palette[color]} ${className}`}
    >
      {children}
    </button>
  )
}

export function JumboPanel({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bezel scanlines overflow-hidden ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-bezel bg-panel-deep px-4 py-2">
          <h2 className="font-display text-lg tracking-[0.12em] text-chalk/90">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

// Initials medallion for a team (used in standings, brackets, scoreboards).
const BADGE_HUES = [28, 200, 275, 120, 350, 45, 170, 320]

export function TeamBadge({ name, index, size = 34 }: { name: string; index: number; size?: number }) {
  const hue = BADGE_HUES[index % BADGE_HUES.length]
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display text-arena"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(150deg, hsl(${hue} 90% 62%), hsl(${hue} 85% 42%))`,
        boxShadow: `0 0 12px -2px hsl(${hue} 90% 55% / 0.55)`,
      }}
    >
      {initials}
    </span>
  )
}

// ------------------------------------------------------------ player card

export function Headshot({ card, className = '' }: { card: Card; className?: string }) {
  const [failed, setFailed] = useState(false)
  const url = headshotUrl(card)
  if (!url || failed) {
    const initials = card.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    return (
      <div className={`flex items-center justify-center bg-panel-deep font-display text-3xl text-mist ${className}`}>
        {initials}
      </div>
    )
  }
  return (
    <img
      src={url}
      onError={() => setFailed(true)}
      alt={card.name}
      loading="lazy"
      className={`object-cover object-top ${className}`}
    />
  )
}

export function PlayerCard({
  card,
  onClick,
  selected,
  dimmed,
  delayMs = 0,
}: {
  card: Card
  onClick?: () => void
  selected?: boolean
  dimmed?: boolean
  delayMs?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ animationDelay: `${delayMs}ms` }}
      className={`foil-${card.tier} animate-card-in relative w-40 shrink-0 overflow-hidden rounded-xl border text-left transition-transform sm:w-44 ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      } ${selected ? 'ring-4 ring-neon' : ''} ${dimmed ? 'opacity-40 grayscale' : ''}`}
    >
      <div className="flex items-start justify-between px-2.5 pt-2">
        <span className={`font-led text-[10px] font-bold tracking-[0.22em] text-tier-${card.tier}`}>{card.tier}</span>
        <span className="text-right">
          <span className="block font-led text-2xl font-black leading-none text-chalk">{card.ovr}</span>
          <span className="block font-led text-[9px] tracking-widest text-mist">OVR</span>
        </span>
      </div>
      <Headshot card={card} className="mx-auto mt-1 h-24 w-32 rounded-md sm:h-28" />
      <div className="px-2.5 pb-2.5 pt-1.5">
        <p className="truncate font-display text-base leading-tight tracking-wide text-chalk">{card.name}</p>
        <p className="font-led text-[10px] tracking-widest text-mist">
          '{String(card.season).slice(2)} {card.teams[0]} · {card.pos}
          {card.hof ? ' · HOF' : ''}
        </p>
        <div className="mt-1.5 flex justify-between font-led text-[10px] text-chalk/80">
          <span>{card.stats.pts.toFixed(1)} P</span>
          <span>{card.stats.reb.toFixed(1)} R</span>
          <span>{card.stats.ast.toFixed(1)} A</span>
        </div>
      </div>
    </button>
  )
}

// Tiny chip for roster strips.
export function MiniCard({ card, label, onClick, highlight }: { card: Card | null; label: string; onClick?: () => void; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left ${
        highlight ? 'border-neon bg-neon/10' : 'border-bezel bg-panel-deep'
      } ${onClick ? 'cursor-pointer hover:border-chalk/40' : ''}`}
    >
      <span className="w-6 shrink-0 font-led text-[9px] font-bold tracking-wider text-mist">{label}</span>
      {card ? (
        <>
          <Headshot card={card} className="h-6 w-6 shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="block max-w-24 truncate text-[11px] font-semibold leading-tight">{card.name.split(' ').at(-1)}</span>
            <span className={`block font-led text-[9px] leading-tight text-tier-${card.tier}`}>{card.ovr}</span>
          </span>
        </>
      ) : (
        <span className="text-[11px] text-mist">—</span>
      )}
    </button>
  )
}

// LED score readout.
export function LedScore({ value, accent = false, size = 'text-4xl' }: { value: number | string; accent?: boolean; size?: string }) {
  return (
    <span key={String(value)} className={`animate-count-pop inline-block font-led font-black ${size} ${accent ? 'neon-text' : 'text-chalk'}`}>
      {value}
    </span>
  )
}

export function PowerMeter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-led text-[10px] tracking-widest text-mist">
        <span>{label}</span>
        <span className="text-chalk">{value}</span>
      </div>
      <div className="led-strip h-3 overflow-hidden rounded-sm">
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{
            width: `${value}%`,
            background: 'linear-gradient(90deg, #ff4d2e, #ffb300 55%, #ffd45c)',
            boxShadow: '0 0 12px rgba(255, 179, 0, 0.7)',
          }}
        />
      </div>
    </div>
  )
}
