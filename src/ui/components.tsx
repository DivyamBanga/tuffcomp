import { useState, type ReactNode } from 'react'
import type { Card } from '../types'
import { headshotUrl } from '../types'

// ------------------------------------------------------------- statusline

// Thin annotation bar with a plotter-head caret.
export function StatusLine({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`statusline ${className}`}>
      <span className="caret" />
      <span className="min-w-0 truncate">{text}</span>
    </div>
  )
}

// ------------------------------------------------------------ sheet bits

export function Sheet({
  title,
  right,
  children,
  className = '',
  pad = true,
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section className={`sheet ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-2.5">
          <h2 className="plate">{title}</h2>
          {right}
        </header>
      )}
      <div className={pad ? 'cell' : ''}>{children}</div>
    </section>
  )
}

export function Btn({
  children,
  onClick,
  disabled,
  primary,
  on,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  on?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn ${primary ? 'btn-primary' : ''} ${on ? 'btn-on' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

// Monochrome team mark: hairline circle, initials in mono.
export function TeamMark({ name, size = 30, gold = false }: { name: string; size?: number; gold?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className={`num inline-flex shrink-0 items-center justify-center rounded-full border ${
        gold ? 'border-gold text-gold' : 'border-line text-dim'
      }`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
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
      <div className={`num flex items-center justify-center bg-paper2 text-xl text-faint ${className}`}>
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
      className={`pcard animate-deal relative w-40 shrink-0 sm:w-44 ${
        onClick ? 'pcard-take' : ''
      } ${selected ? 'gold-line' : ''} ${dimmed ? 'opacity-35 grayscale' : ''}`}
    >
      <div className="photo-well">
        <Headshot card={card} className="h-28 w-full sm:h-32" />
        <span className="num absolute right-1.5 top-1 text-2xl font-bold text-ink [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
          {card.ovr}
        </span>
      </div>
      <div className="px-2.5 pb-2 pt-1.5">
        <p className="headline truncate text-[13px] leading-tight text-ink">{card.name}</p>
        <div className="num mt-1 flex justify-between text-[10px] text-dim">
          <span>'{String(card.season).slice(2)} {card.teams[0]}</span>
          <span>{card.pos}</span>
          <span>{card.stats.pts.toFixed(0)}·{card.stats.reb.toFixed(0)}·{card.stats.ast.toFixed(0)}</span>
        </div>
      </div>
    </button>
  )
}

// Tiny chip for roster strips.
export function MiniCard({
  card,
  label,
  onClick,
  highlight,
}: {
  card: Card | null
  label: string
  onClick?: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex min-w-0 items-center gap-1.5 border px-1.5 py-1 text-left transition-colors ${
        highlight ? 'border-hot bg-paper2' : 'border-line bg-paper'
      } ${onClick ? 'cursor-pointer hover:border-hot' : ''}`}
    >
      <span className="plate plate-faint w-5 shrink-0 !text-[8.5px]">{label}</span>
      {card ? (
        <>
          <Headshot card={card} className="h-6 w-6 shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="block max-w-24 truncate text-[11px] font-semibold leading-tight text-ink">
              {card.name.split(' ').at(-1)}
            </span>
            <span className="num block text-[9px] leading-tight text-dim">{card.ovr}</span>
          </span>
        </>
      ) : (
        <span className="text-[11px] text-faint">—</span>
      )}
    </button>
  )
}

// Mono score readout that ticks when the value changes.
export function NumTick({ value, gold = false, size = 'text-3xl' }: { value: number | string; gold?: boolean; size?: string }) {
  return (
    <span key={String(value)} className={`num animate-tick inline-block font-bold ${size} ${gold ? 'gold' : 'text-ink'}`}>
      {value}
    </span>
  )
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="plate !text-[9px]">{label}</span>
        <span className="num text-xs text-ink">{value}</span>
      </div>
      <div className="h-[3px] border border-line">
        <div
          className="h-full bg-ink transition-all duration-700"
          style={{ width: `${value}%`, transitionTimingFunction: 'var(--ease-draft)' }}
        />
      </div>
    </div>
  )
}

// A gold ring that draws itself - the game's seal.
export function RingSeal({ size = 120, strokeWidth = 5, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth={strokeWidth}
        strokeDasharray={c}
        strokeLinecap="round"
        className="ring-draw"
        style={{ '--ring-c': c, transform: 'rotate(-90deg)', transformOrigin: 'center' } as React.CSSProperties}
      />
    </svg>
  )
}

// Champion confetti: falling pen strokes in ink and gold.
const STROKE_COLORS = ['var(--color-gold)', 'var(--color-hot)', 'var(--color-gold)', 'var(--color-dim)']

export function PenStrokes({ count = 56 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="animate-strokes pointer-events-none absolute top-0 block"
          style={{
            left: `${(i * 137.5) % 100}%`,
            width: 2,
            height: 12,
            background: STROKE_COLORS[i % STROKE_COLORS.length],
            animationDelay: `${(i % 20) * 0.17}s`,
            animationDuration: `${2.8 + (i % 5) * 0.45}s`,
          }}
        />
      ))}
    </>
  )
}
