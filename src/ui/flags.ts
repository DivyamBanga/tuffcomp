const FLAGS: Record<string, string> = {
  France: '🇫🇷',
  Argentina: '🇦🇷',
  Brazil: '🇧🇷',
  Spain: '🇪🇸',
  Germany: '🇩🇪',
  Italy: '🇮🇹',
  Netherlands: '🇳🇱',
  England: '🇬🇧',
  Portugal: '🇵🇹',
}

export function flagFor(team: string): string {
  return FLAGS[team] ?? '⚽'
}
