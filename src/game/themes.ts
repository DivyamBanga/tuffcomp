import type { Card } from '../types'
import franchisesJson from '../data/franchises.json'
import themeDataJson from '../data/themeData.json'
import { STARTER_SLOTS, canPlaySlot } from '../engine/lineup'
import { mulberry32, shuffle } from '../engine/prng'

const FRANCHISE_NAMES = franchisesJson as Record<string, string>

interface ThemeData {
  heights: Record<string, number>
  weights: Record<string, number>
  firstSeason: Record<string, number>
  mvp: string[]
  dpoy: string[]
  smoy: string[]
  roy: string[]
  allStarSeasons: string[]
  everAllStar: string[]
  firstOverall: string[]
  undrafted: string[]
  rings: string[]
  oneTeam: string[]
  journeymen: string[]
}

const DATA = themeDataJson as ThemeData

// ---------------------------------------------------------------- themes
//
// A theme is the draft's one constraint: every drafter answers the same
// question for all eight rounds. Themes are code (test functions), so only
// theme IDS are ever serialized or sent over the wire; both ends resolve
// them through this registry.

export type ThemeKind = 'franchise' | 'era' | 'stat' | 'bio' | 'career' | 'award' | 'list'

export const KIND_ORDER: ThemeKind[] = ['franchise', 'era', 'stat', 'bio', 'career', 'award', 'list']

export const KIND_LABELS: Record<ThemeKind, string> = {
  franchise: 'TEAMS',
  era: 'ERAS',
  stat: 'STAT LINES',
  bio: 'MEASURABLES',
  career: 'CAREER PATHS',
  award: 'HARDWARE',
  list: 'THE LISTS',
}

export interface Theme {
  id: string
  kind: ThemeKind
  label: string
  detail: string
  test: (card: Card) => boolean
}

// -------------------------------------------------------------- matching

// Shared name normalization: case, diacritics, punctuation. A few letters
// (dotless ı, ł, ø, đ) don't decompose under NFD and need explicit maps -
// Ömer Aşık taught us that.
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/[.'’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------- curated lists
//
// Race, birthplace, handedness, hairlines, and family trees aren't in any
// stats dataset, so these are curated from public record (notable players
// only) and validated by tests against the real pool. Matching is by
// normalized full name.

const INTERNATIONAL = [
  // The pioneers and the 80s-90s wave
  'Tom Meschery', 'Swen Nater', 'Mychal Thompson', 'Rolando Blackman', 'Kiki Vandeweghe',
  'Hakeem Olajuwon', 'Patrick Ewing', 'Dikembe Mutombo', 'Manute Bol', 'Detlef Schrempf',
  'Rik Smits', 'Vlade Divac', 'Drazen Petrovic', 'Toni Kukoc', 'Sarunas Marciulionis',
  'Arvydas Sabonis', 'Luc Longley', 'Rony Seikaly', 'Dino Radja', 'Gheorghe Muresan',
  'Bill Wennington', 'Rick Fox', 'Todd MacCulloch', 'Jamaal Magloire', 'Michael Olowokandi',
  // The 2000s takeover
  'Steve Nash', 'Dirk Nowitzki', 'Peja Stojakovic', 'Pau Gasol', 'Marc Gasol',
  'Tony Parker', 'Manu Ginobili', 'Yao Ming', 'Yi Jianlian', 'Andrei Kirilenko',
  'Zydrunas Ilgauskas', 'Hedo Turkoglu', 'Mehmet Okur', 'Ersan Ilyasova', 'Omer Asik',
  'Sarunas Jasikevicius',
  'Andrea Bargnani', 'Luol Deng', 'Serge Ibaka', 'Al Horford', 'Ricky Rubio',
  'Jose Calderon', 'Rudy Fernandez', 'Luis Scola', 'Carlos Delfino', 'Andres Nocioni',
  'Fabricio Oberto', 'Greivis Vasquez', 'Eduardo Najera', 'Samuel Dalembert', 'Boris Diaw',
  'Mickael Pietrus', 'Ronny Turiaf', 'Ian Mahinmi', 'Anderson Varejao', 'Nene',
  'Leandro Barbosa', 'Tiago Splitter', 'Thabo Sefolosha', 'Omri Casspi', 'Beno Udrih',
  'Zaza Pachulia', 'Mirza Teletovic', 'Donatas Motiejunas', 'Goran Dragic', 'Nicolas Batum',
  'Marcin Gortat', 'Jonas Valanciunas', 'Nikola Vucevic', 'Danilo Gallinari', 'Marco Belinelli',
  // The modern world order
  'Rudy Gobert', 'Giannis Antetokounmpo', 'Kristaps Porzingis', 'Nikola Jokic', 'Ben Simmons',
  'Joel Embiid', 'Domantas Sabonis', 'Lauri Markkanen', 'Luka Doncic', 'Shai Gilgeous-Alexander',
  'Jamal Murray', 'Andrew Wiggins', 'Pascal Siakam', 'OG Anunoby', 'Alperen Sengun',
  'Franz Wagner', 'Moritz Wagner', 'Josh Giddey', 'Victor Wembanyama', 'Clint Capela',
  'Bogdan Bogdanovic', 'Bojan Bogdanovic', 'Evan Fournier', 'Dennis Schroder', 'Kyrie Irving',
  'Andrew Bogut', 'Dario Saric', 'Jusuf Nurkic', 'Ivica Zubac', 'Nikola Mirotic',
  'Nikola Jovic', 'Davis Bertans', 'Nemanja Bjelica', 'Mario Hezonja',
  'Jakob Poeltl', 'Daniel Theis', 'Maxi Kleber', 'Tomas Satoransky', 'Simone Fontecchio',
  'Patty Mills', 'Matthew Dellavedova', 'Joe Ingles', 'Aron Baynes', 'Dante Exum',
  'Josh Green', 'Dyson Daniels', 'Steven Adams', 'Enes Freedom', 'Cedi Osman',
  'Goga Bitadze', 'Precious Achiuwa', 'Josh Okogie', 'Gorgui Dieng', 'Rui Hachimura',
  'Deandre Ayton', 'Buddy Hield', 'Santi Aldama', 'Willy Hernangomez', 'Juancho Hernangomez',
  'Deni Avdija', 'Guerschon Yabusele', 'Bilal Coulibaly', 'Zaccharie Risacher', 'Alex Sarr',
  'Chris Boucher', 'Kelly Olynyk', 'RJ Barrett', 'Dillon Brooks', 'Luguentz Dort',
  'Shaedon Sharpe', 'Bennedict Mathurin', 'Andrew Nembhard', 'Nickeil Alexander-Walker', 'Zach Edey',
  'Dwight Powell', 'Brandon Clarke', 'Tristan Thompson', 'Cory Joseph', 'Trey Lyles',
]

const WHITE_GUYS = [
  // The founding fathers
  'George Mikan', 'Bob Cousy', 'Bill Sharman', 'Dolph Schayes', 'Bob Pettit',
  'Paul Arizin', 'George Yardley', 'Cliff Hagan', 'Tom Heinsohn', 'Frank Ramsey',
  'Ed Macauley', 'Neil Johnston', 'Vern Mikkelsen', 'Jim Pollard', 'Slater Martin',
  'Bob Davies', 'Bobby Wanzer', 'Richie Guerin', 'Jack Twyman', 'Carl Braun',
  // The 60s and 70s
  'Jerry West', 'John Havlicek', 'Rick Barry', 'Pete Maravich', 'Jerry Lucas',
  'Billy Cunningham', 'Dave DeBusschere', 'Bill Bradley', 'Gail Goodrich', 'Doug Collins',
  'Dan Issel', 'Bailey Howell', 'Jerry Sloan', 'Dick Van Arsdale', 'Tom Van Arsdale',
  'Rudy Tomjanovich', 'Bobby Jones', 'Swen Nater', 'Tom Meschery',
  // The 80s and 90s
  'Larry Bird', 'Kevin McHale', 'Bill Walton', 'Jack Sikma', 'Bill Laimbeer',
  'Alvan Adams', 'Paul Westphal', 'Dave Cowens', 'Kurt Rambis', 'Danny Ainge',
  'John Paxson', 'Steve Kerr', 'Mark Eaton', 'Chris Mullin', 'John Stockton',
  'Jeff Hornacek', 'Mark Price', 'Brad Daugherty', 'Tom Chambers', 'Dan Majerle',
  'Detlef Schrempf', 'Rex Chapman', 'Christian Laettner', 'Rik Smits', 'Arvydas Sabonis',
  'Toni Kukoc', 'Vlade Divac', 'Drazen Petrovic', 'Keith Van Horn', 'Tom Gugliotta',
  'Shawn Bradley', 'Greg Ostertag', 'Bryant Reeves', 'Luc Longley', 'Bill Wennington',
  'Jason Williams', 'Brent Barry', 'Jon Barry',
  // The 2000s and 2010s
  'Troy Murphy', 'Steve Nash', 'Dirk Nowitzki', 'Peja Stojakovic', 'Brad Miller',
  'Wally Szczerbiak', 'Mike Miller', 'Mike Dunleavy', 'Chris Kaman', 'Spencer Hawes',
  'Doug McDermott', 'Kyle Korver', 'JJ Redick', 'Kirk Hinrich', 'David Lee',
  'Kevin Love', 'Gordon Hayward', 'Chandler Parsons', 'Ryan Anderson', 'Kelly Olynyk',
  'Zydrunas Ilgauskas', 'Andrew Bogut', 'Joe Ingles', 'Matthew Dellavedova', 'Goran Dragic',
  'Ricky Rubio', 'Jose Calderon', 'Adam Morrison', 'Matt Bonner', 'Tyler Hansbrough',
  'Luke Ridnour', 'Steve Blake', 'Beno Udrih', 'Frank Kaminsky', 'Meyers Leonard',
  'Tyler Zeller', 'Miles Plumlee', 'Joe Harris',
  // Today
  'Luka Doncic', 'Nikola Jokic', 'Nikola Vucevic', 'Jusuf Nurkic', 'Bojan Bogdanovic',
  'Bogdan Bogdanovic', 'Kristaps Porzingis', 'Lauri Markkanen', 'Domantas Sabonis', 'Jonas Valanciunas',
  'Rudy Gobert', 'Ivica Zubac', 'Isaiah Hartenstein', 'Franz Wagner', 'Moritz Wagner',
  'Tyler Herro', 'Duncan Robinson', 'Luke Kennard', 'Grayson Allen', 'Donte DiVincenzo',
  'Sam Hauser', 'Payton Pritchard', 'Georges Niang', 'TJ McConnell', 'Cody Zeller',
  'Mason Plumlee', 'Kevin Huerter', 'Austin Reaves', 'Danilo Gallinari', 'Davis Bertans',
  'Nemanja Bjelica', 'Dario Saric', 'Nikola Mirotic', 'Marco Belinelli',
  'Simone Fontecchio', 'Daniel Theis', 'Maxi Kleber', 'Jakob Poeltl', 'Tomas Satoransky',
  'Chet Holmgren', 'Walker Kessler', 'Christian Braun', 'Brandin Podziemski', 'Keegan Murray',
  'Zach Edey', 'Gradey Dick', 'Matas Buzelis', 'Zach Collins', 'Nik Stauskas',
  'Cooper Flagg',
]

// Famously bald or shaved-headed. A vibes list, proudly.
const BALD_SQUAD = [
  'Michael Jordan', 'Charles Barkley', 'Karl Malone', 'Jason Kidd', "Shaquille O'Neal",
  'Alonzo Mourning', 'Dikembe Mutombo', 'Xavier McDaniel', 'Horace Grant', 'Slick Watts',
  'Sam Cassell', 'Kurt Thomas', 'Kevin Willis', 'John Salley', 'James Edwards',
  'Rick Mahorn', 'Jason Terry', 'Mike Bibby', 'Nene', 'Elton Brand',
  'Ben Gordon', 'Tyson Chandler', 'Marcin Gortat', 'Channing Frye', 'Montrezl Harrell',
  'PJ Tucker', 'Taj Gibson', 'Udonis Haslem', 'James Posey', 'Anthony Tolliver',
  'Fred VanVleet', 'Marcus Morris', 'Shawn Marion', 'Jerry Stackhouse', 'Paul Millsap',
]

// Left-handed. The southpaw all-stars.
const LEFTIES = [
  'Bill Russell', 'Willis Reed', 'Guy Rodgers', 'Dick Barnett', 'Lenny Wilkens',
  'Gail Goodrich', 'Billy Cunningham', 'Bob Lanier', 'Artis Gilmore', 'Chris Mullin',
  'Sam Perkins', 'Nick Van Exel', 'Kenny Anderson', 'Toni Kukoc', 'Stacey Augmon',
  'Vin Baker', 'Chris Bosh', 'Lamar Odom', 'Mike Conley', 'Michael Redd',
  'Manu Ginobili', 'James Harden', 'Zach Randolph', 'Josh Smith', 'Goran Dragic',
  'Julius Randle', 'Zion Williamson', 'Ben Simmons', "De'Aaron Fox", 'RJ Barrett',
  'Josh Giddey', 'Keldon Johnson', 'Thaddeus Young', 'Greg Monroe', 'Michael Beasley',
  'Justise Winslow', 'Talen Horton-Tucker', 'Willie Cauley-Stein', 'Derrick White',
]

// Born or raised in the True North.
const CANADIANS = [
  'Ernie Vandeweghe', 'Bob Houbregs', 'Bill Wennington', 'Rick Fox', 'Todd MacCulloch',
  'Jamaal Magloire', 'Steve Nash', 'Samuel Dalembert', 'Tristan Thompson', 'Cory Joseph',
  'Andrew Wiggins', 'Kelly Olynyk', 'Dwight Powell', 'Trey Lyles', 'Nik Stauskas',
  'Jamal Murray', 'Chris Boucher', 'Dillon Brooks', 'Shai Gilgeous-Alexander',
  'RJ Barrett', 'Luguentz Dort', 'Brandon Clarke', 'Nickeil Alexander-Walker', 'Oshae Brissett',
  'Khem Birch', 'Shaedon Sharpe', 'Bennedict Mathurin', 'Andrew Nembhard', 'Dalano Banton',
  'Zach Edey',
]

// An immediate family member (father, son, or brother) also played in the
// NBA. Dynasty ball.
const BLOODLINES = [
  // Fathers and sons
  'Dell Curry', 'Stephen Curry', 'Seth Curry', 'Mychal Thompson', 'Klay Thompson',
  'Joe Bryant', 'Kobe Bryant', 'Rick Barry', 'Brent Barry', 'Jon Barry',
  'Bill Walton', 'Luke Walton', 'Tim Hardaway', 'Tim Hardaway Jr.', 'Larry Nance',
  'Larry Nance Jr.', 'Gary Payton', 'Gary Payton II', 'Arvydas Sabonis', 'Domantas Sabonis',
  'Doc Rivers', 'Austin Rivers', 'Jalen Brunson', 'LeBron James', 'Dolph Schayes',
  'Danny Schayes', 'Ernie Vandeweghe', 'Kiki Vandeweghe', 'Pete Maravich', 'Matt Guokas',
  'Jimmy Walker', 'Jalen Rose', 'Henry Bibby', 'Mike Bibby', 'Patrick Ewing',
  'Al Horford', 'Kevin Love', 'Mitchell Wiggins', 'Andrew Wiggins', 'Harvey Grant',
  'Horace Grant', 'Jerami Grant', 'Jaren Jackson', 'Jaren Jackson Jr.', 'Gary Trent',
  'Gary Trent Jr.', 'Devin Booker', 'Glenn Robinson', 'Glenn Robinson III', 'Scottie Pippen',
  'Ron Harper', 'Kenyon Martin', 'Wes Matthews', 'Wesley Matthews', 'Jabari Smith Jr.',
  // Brothers
  'Pau Gasol', 'Marc Gasol', 'Brook Lopez', 'Robin Lopez', 'Marcus Morris',
  'Markieff Morris', 'Franz Wagner', 'Moritz Wagner', 'Lonzo Ball', 'LaMelo Ball',
  'Amen Thompson', 'Ausar Thompson', 'Cody Zeller', 'Tyler Zeller', 'Mason Plumlee',
  'Miles Plumlee', 'Caleb Martin', 'Cody Martin', 'Keegan Murray', 'Kris Murray',
  'Jrue Holiday', 'Justin Holiday', 'Aaron Holiday', 'Giannis Antetokounmpo',
  'Dick Van Arsdale', 'Tom Van Arsdale',
]

function nameSet(names: string[]): Set<string> {
  return new Set(names.map(normalizeName))
}

const INTL_SET = nameSet(INTERNATIONAL)
const WHITE_SET = nameSet(WHITE_GUYS)
const BALD_SET = nameSet(BALD_SQUAD)
const LEFTY_SET = nameSet(LEFTIES)
const CANADA_SET = nameSet(CANADIANS)
const BLOOD_SET = nameSet(BLOODLINES)

export const CURATED_LISTS: Record<string, string[]> = {
  'list-intl': INTERNATIONAL,
  'list-white': WHITE_GUYS,
  'list-bald': BALD_SQUAD,
  'list-lefty': LEFTIES,
  'list-canada': CANADIANS,
  'list-blood': BLOODLINES,
}

// ------------------------------------------------------- theme data lookups

const MVP_PIDS = new Set(DATA.mvp)
const DPOY_PIDS = new Set(DATA.dpoy)
const SMOY_PIDS = new Set(DATA.smoy)
const ROY_PIDS = new Set(DATA.roy)
const AS_SEASONS = new Set(DATA.allStarSeasons)
const EVER_AS = new Set(DATA.everAllStar)
const NO1_PIDS = new Set(DATA.firstOverall)
const UNDRAFTED_PIDS = new Set(DATA.undrafted)
const RING_PIDS = new Set(DATA.rings)
const ONE_TEAM_PIDS = new Set(DATA.oneTeam)
const JOURNEY_PIDS = new Set(DATA.journeymen)

// ---------------------------------------------------------- the registry

// Storied franchises with deep all-time pools. Lineages fold name-carrying
// relocations into today's brand, so Mikan's Minneapolis Lakers count as
// Lakers and Wilt's Philadelphia Warriors count as Warriors.
// Renamed franchises (SEA -> OKC) stay separate on purpose.
const THEME_FRANCHISES = [
  'LAL', 'BOS', 'CHI', 'GSW', 'MIA', 'SAS', 'DET', 'NYK', 'PHI', 'PHO',
  'DAL', 'HOU', 'MIL', 'CLE', 'DEN', 'UTA', 'POR', 'SEA', 'TOR', 'ATL',
  'ORL', 'IND', 'OKC', 'MEM', 'SAC',
]

const LINEAGE: Record<string, string[]> = {
  LAL: ['MNL'],
  GSW: ['PHW', 'SFW'],
  DET: ['FTW'],
  HOU: ['SDR'],
  UTA: ['NOJ'],
  ATL: ['TRI', 'MLH', 'STL'],
  SAC: ['ROC', 'CIN', 'KCO', 'KCK'],
  PHI: ['SYR'],
}

function franchiseThemes(): Theme[] {
  return THEME_FRANCHISES.map((abbrev) => {
    const family = [abbrev, ...(LINEAGE[abbrev] ?? [])]
    return {
      id: `fran-${abbrev}`,
      kind: 'franchise' as const,
      label: `${(FRANCHISE_NAMES[abbrev] ?? abbrev).toUpperCase()} ONLY`,
      detail: `Any season in a ${FRANCHISE_NAMES[abbrev] ?? abbrev} uniform, any era.`,
      test: (c: Card) => c.teams.some((t) => family.includes(t)),
    }
  })
}

function eraThemes(): Theme[] {
  const eras: [string, string, number, number, string][] = [
    ['era-pioneers', 'THE PIONEERS ONLY', 1947, 1959, 'Set shots and short shorts. Seasons 1947-1959.'],
    ['era-60s', "THE '60s ONLY", 1960, 1969, 'Russell vs Wilt. Seasons 1960-1969.'],
    ['era-70s', "THE '70s ONLY", 1970, 1979, 'Afros and finger rolls. Seasons 1970-1979.'],
    ['era-80s', "THE '80s ONLY", 1980, 1989, 'Showtime and hand checks. Seasons 1980-1989.'],
    ['era-90s', "THE '90s ONLY", 1990, 1999, 'The golden grind. Seasons 1990-1999.'],
    ['era-00s', 'THE 2000s ONLY', 2000, 2009, 'Iso ball and baggy fits. Seasons 2000-2009.'],
    ['era-10s', 'THE 2010s ONLY', 2010, 2019, 'Pace, space, threes. Seasons 2010-2019.'],
    ['era-20s', 'MODERN ERA ONLY', 2020, 2026, 'The unicorn years. Seasons 2020-2026.'],
  ]
  return eras.map(([id, label, from, to, detail]) => ({
    id,
    kind: 'era' as const,
    label,
    detail,
    test: (c: Card) => c.season >= from && c.season <= to,
  }))
}

function statThemes(): Theme[] {
  return [
    {
      id: 'stat-snipers',
      kind: 'stat',
      label: '40% FROM DEEP',
      detail: 'Real snipers only: shot 40%+ from three that season.',
      test: (c) => c.stats.tp >= 40 && c.attrs.sh >= 60,
    },
    {
      id: 'stat-buckets',
      kind: 'stat',
      label: '25+ PPG SCORERS',
      detail: 'Certified bucket getters: 25 or more a night.',
      test: (c) => c.stats.pts >= 25,
    },
    {
      id: 'stat-lockdown',
      kind: 'stat',
      label: 'LOCKDOWN DEFENDERS',
      detail: 'Elite defensive seasons only. Buckets not included.',
      test: (c) => c.attrs.df >= 85,
    },
    {
      id: 'stat-glass',
      kind: 'stat',
      label: 'GLASS CLEANERS',
      detail: '11+ rebounds a game. Board man gets paid.',
      test: (c) => c.stats.reb >= 11,
    },
    {
      id: 'stat-generals',
      kind: 'stat',
      label: 'FLOOR GENERALS',
      detail: '8+ assists a game. The offense runs through them.',
      test: (c) => c.stats.ast >= 8,
    },
    {
      id: 'stat-swats',
      kind: 'stat',
      label: 'RIM PROTECTORS',
      detail: '2+ blocks a game. Nothing easy at the rim.',
      test: (c) => c.stats.blk >= 2,
    },
    {
      id: 'stat-ironmen',
      kind: 'stat',
      label: 'IRON MEN',
      detail: '38+ minutes a night. Load management not invented yet.',
      test: (c) => c.mpg >= 38,
    },
  ]
}

function bioThemes(): Theme[] {
  const height = (c: Card) => DATA.heights[c.pid] ?? 0
  const weight = (c: Card) => DATA.weights[c.pid] ?? 0
  return [
    {
      id: 'bio-under25',
      kind: 'bio',
      label: 'UNDER 25 ONLY',
      detail: 'Young legs only: 24 or younger that season.',
      test: (c) => c.age !== null && c.age <= 24,
    },
    {
      id: 'bio-oldman',
      kind: 'bio',
      label: 'OLD MAN GAME',
      detail: '35 or older that season. Craft beats cartilage.',
      test: (c) => c.age !== null && c.age >= 35,
    },
    {
      id: 'bio-sevenfeet',
      kind: 'bio',
      label: '7-FOOTERS ONLY',
      detail: 'Seven feet or taller. The air up there.',
      test: (c) => height(c) >= 84,
    },
    {
      id: 'bio-shortkings',
      kind: 'bio',
      label: `6'4" AND UNDER`,
      detail: 'Short kings only. Heart over height.',
      test: (c) => height(c) > 0 && height(c) <= 76,
    },
    {
      id: 'bio-heavy',
      kind: 'bio',
      label: 'HEAVYWEIGHTS ONLY',
      detail: '250 pounds or more. Ground and pound.',
      test: (c) => weight(c) >= 250,
    },
  ]
}

function careerThemes(): Theme[] {
  return [
    {
      id: 'career-loyal',
      kind: 'career',
      label: 'ONE-TEAM LOYALS',
      detail: 'Whole career, one franchise. Ride or die.',
      test: (c) => ONE_TEAM_PIDS.has(c.pid),
    },
    {
      id: 'career-journeymen',
      kind: 'career',
      label: 'JOURNEYMEN ONLY',
      detail: 'Six or more franchises in a career. Suitcase lifestyle.',
      test: (c) => JOURNEY_PIDS.has(c.pid),
    },
    {
      id: 'career-ringless',
      kind: 'career',
      label: 'RINGLESS ONLY',
      detail: 'Never won it all. The best team nobody let win.',
      test: (c) => !RING_PIDS.has(c.pid),
    },
    {
      id: 'career-champs',
      kind: 'career',
      label: 'CHAMPS ONLY',
      detail: 'Won a ring somewhere along the way.',
      test: (c) => RING_PIDS.has(c.pid),
    },
    {
      id: 'career-rookies',
      kind: 'career',
      label: 'ROOKIE SEASONS ONLY',
      detail: 'Debut campaigns only. Day-one talent.',
      test: (c) => DATA.firstSeason[c.pid] === c.season,
    },
  ]
}

function awardThemes(): Theme[] {
  return [
    {
      id: 'list-mvp',
      kind: 'award',
      label: 'MVP WINNERS ONLY',
      detail: 'Any season by a player who has won the MVP award.',
      test: (c) => MVP_PIDS.has(c.pid),
    },
    {
      id: 'award-dpoy',
      kind: 'award',
      label: 'DPOY WINNERS ONLY',
      detail: 'Any season by a Defensive Player of the Year.',
      test: (c) => DPOY_PIDS.has(c.pid),
    },
    {
      id: 'award-smoy',
      kind: 'award',
      label: '6TH MAN WINNERS',
      detail: 'Any season by a Sixth Man of the Year. Bench energy.',
      test: (c) => SMOY_PIDS.has(c.pid),
    },
    {
      id: 'award-roy',
      kind: 'award',
      label: 'ROY WINNERS ONLY',
      detail: 'Any season by a Rookie of the Year.',
      test: (c) => ROY_PIDS.has(c.pid),
    },
    {
      id: 'award-allstar',
      kind: 'award',
      label: 'ALL-STAR SEASONS',
      detail: 'Only seasons where they made that All-Star Game.',
      test: (c) => AS_SEASONS.has(`${c.pid}|${c.season}`),
    },
    {
      id: 'award-neverstar',
      kind: 'award',
      label: 'NEVER AN ALL-STAR',
      detail: 'Not one All-Star nod, ever. Deep cuts only.',
      test: (c) => !EVER_AS.has(c.pid),
    },
    {
      id: 'award-no1',
      kind: 'award',
      label: '#1 PICKS ONLY',
      detail: 'Went first overall on draft night.',
      test: (c) => NO1_PIDS.has(c.pid),
    },
    {
      id: 'award-undrafted',
      kind: 'award',
      label: 'UNDRAFTED ONLY',
      detail: 'Every name got called before theirs. Then they hooped.',
      test: (c) => UNDRAFTED_PIDS.has(c.pid),
    },
  ]
}

function listThemes(): Theme[] {
  return [
    {
      id: 'list-hof',
      kind: 'list',
      label: 'HALL OF FAMERS ONLY',
      detail: 'Enshrined in Springfield or bust.',
      test: (c) => c.hof,
    },
    {
      id: 'list-intl',
      kind: 'list',
      label: 'INTERNATIONAL ONLY',
      detail: 'The world took over. USA need not apply.',
      test: (c) => INTL_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-white',
      kind: 'list',
      label: 'WHITE GUYS ONLY',
      detail: 'The all-time great white squad. You know the legends.',
      test: (c) => WHITE_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-bald',
      kind: 'list',
      label: 'BALD SQUAD ONLY',
      detail: 'Shine on the dome, buckets in the paint.',
      test: (c) => BALD_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-lefty',
      kind: 'list',
      label: 'LEFTIES ONLY',
      detail: 'Southpaws. The wrong hand doing everything right.',
      test: (c) => LEFTY_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-canada',
      kind: 'list',
      label: 'CANADIANS ONLY',
      detail: 'The True North squad. Sorry in advance.',
      test: (c) => CANADA_SET.has(normalizeName(c.name)),
    },
    {
      id: 'list-blood',
      kind: 'list',
      label: 'NBA BLOODLINES',
      detail: 'A father, son, or brother also made the league.',
      test: (c) => BLOOD_SET.has(normalizeName(c.name)),
    },
  ]
}

export const THEMES: Theme[] = [
  ...franchiseThemes(),
  ...eraThemes(),
  ...statThemes(),
  ...bioThemes(),
  ...careerThemes(),
  ...awardThemes(),
  ...listThemes(),
]

const THEMES_BY_ID = new Map(THEMES.map((t) => [t.id, t]))

export function themeById(id: string): Theme {
  const theme = THEMES_BY_ID.get(id)
  if (!theme) throw new Error(`unknown theme: ${id}`)
  return theme
}

// ------------------------------------------------------- theme selection

// One theme carries the ENTIRE draft, so it needs serious depth: enough
// distinct people for every pick with slack to spare, and stars worth
// fighting over in round 1 (thin lists naturally drop out for bigger
// leagues).
export function themeCanCarryDraft(theme: Theme, pool: Card[], playerCount: number, rounds: number): boolean {
  const eligible = pool.filter(theme.test)
  const pids = new Set(eligible.map((c) => c.pid))
  if (pids.size < playerCount * rounds + 8) return false

  const starPids = new Set(eligible.filter((c) => c.ovr >= 85).map((c) => c.pid))
  if (starPids.size < playerCount) return false

  return true
}

// A theme that can't cover every starter slot with legal position players
// (7-FOOTERS has no guards, FLOOR GENERALS has no centers) plays
// POSITIONLESS: anyone can fill any slot and placement goes by skills -
// the best passer runs point, the rim gods anchor the middle. Every pick
// still fits the category; no board ever opens for positions.
export function themeNeedsPositionless(theme: Theme, pool: Card[], playerCount: number): boolean {
  const eligible = pool.filter(theme.test)
  for (const slot of STARTER_SLOTS) {
    const coverage = new Set(eligible.filter((c) => canPlaySlot(c, slot)).map((c) => c.pid))
    if (coverage.size < playerCount * 2) return true
  }
  return false
}

// Every theme deep enough for this league, in registry order. The picker
// screen shows exactly these.
export function eligibleThemes(pool: Card[], playerCount: number, rounds: number): Theme[] {
  return THEMES.filter((theme) => themeCanCarryDraft(theme, pool, playerCount, rounds))
}

// The draft's one theme: an explicitly chosen theme wins when it can carry
// the draft; otherwise a seeded shuffle finds one that can.
export function pickDraftTheme(
  pool: Card[],
  playerCount: number,
  seed: number,
  rounds: number,
  chosen?: string | null,
): string {
  if (chosen) {
    const theme = THEMES_BY_ID.get(chosen)
    if (theme && themeCanCarryDraft(theme, pool, playerCount, rounds)) return theme.id
  }
  const shuffled = shuffle(mulberry32(seed), THEMES)
  for (const theme of shuffled) {
    if (themeCanCarryDraft(theme, pool, playerCount, rounds)) return theme.id
  }
  // Eras alone can carry any league size, so this is unreachable with the
  // real pool - but never crash a draft over it.
  return shuffled[0].id
}

// ----------------------------------------------------------- typed picks

interface NameEntry {
  pid: string
  name: string
  norm: string
  tokens: string[]
  peak: number
}

const indexCache = new WeakMap<Card[], NameEntry[]>()

function nameIndex(pool: Card[]): NameEntry[] {
  const cached = indexCache.get(pool)
  if (cached) return cached
  const byPid = new Map<string, NameEntry>()
  for (const card of pool) {
    const existing = byPid.get(card.pid)
    if (existing) {
      existing.peak = Math.max(existing.peak, card.ovr)
    } else {
      const norm = normalizeName(card.name)
      byPid.set(card.pid, { pid: card.pid, name: card.name, norm, tokens: norm.split(' '), peak: card.ovr })
    }
  }
  const entries = [...byPid.values()]
  indexCache.set(pool, entries)
  return entries
}

function editDistanceAtMost2(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]
    dp[0] = j
    let rowMin = dp[0]
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i]
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
      rowMin = Math.min(rowMin, dp[i])
    }
    if (rowMin > 2) return false
  }
  return dp[a.length] <= 2
}

// Query tokens must prefix-match the name's tokens in order, so
// "steph curry" hits "stephen curry" and "j kidd" hits "jason kidd".
function tokensPrefixMatch(query: string[], name: string[]): boolean {
  let ni = 0
  for (const q of query) {
    while (ni < name.length && !name[ni].startsWith(q)) ni++
    if (ni >= name.length) return false
    ni++
  }
  return true
}

// Autocomplete for the type-in box: spelling help only. Suggestions come
// from ALL players and are never filtered to the theme, so the dropdown
// helps you type "Antetokounmpo" without telling you who fits.
export function suggestNames(pool: Card[], query: string, limit = 6): { pid: string; name: string }[] {
  const q = normalizeName(query)
  if (q.length < 2) return []
  const qTokens = q.split(' ')

  // Full-name and single-token prefixes rank together so fame breaks the
  // tie: "ante" should surface Antetokounmpo before Ante Zizic.
  const scored: { entry: NameEntry; rank: number }[] = []
  for (const entry of nameIndex(pool)) {
    let rank: number
    if (entry.norm.startsWith(q) || entry.tokens.some((token) => token.startsWith(q))) rank = 2
    else if (tokensPrefixMatch(qTokens, entry.tokens)) rank = 1
    else continue
    scored.push({ entry, rank })
  }
  scored.sort((a, b) => b.rank - a.rank || b.entry.peak - a.entry.peak)
  return scored.slice(0, limit).map(({ entry }) => ({ pid: entry.pid, name: entry.name }))
}

// Resolve what the drafter meant. Ties go to the biggest name (highest
// peak overall) - typing "jordan" means Michael, not DeAndre.
export function resolveTypedPick(pool: Card[], query: string): { pid: string; name: string } | null {
  const q = normalizeName(query)
  if (q.length < 2) return null
  const entries = nameIndex(pool)
  const qTokens = q.split(' ')

  const best = (candidates: NameEntry[]) =>
    candidates.length === 0 ? null : candidates.reduce((a, b) => (b.peak > a.peak ? b : a))

  const exact = best(entries.filter((e) => e.norm === q))
  if (exact) return { pid: exact.pid, name: exact.name }

  const prefix = best(entries.filter((e) => tokensPrefixMatch(qTokens, e.tokens)))
  if (prefix) return { pid: prefix.pid, name: prefix.name }

  if (qTokens.length === 1) {
    const single = best(entries.filter((e) => e.tokens.includes(q)))
    if (single) return { pid: single.pid, name: single.name }
  }

  const fuzzy = best(entries.filter((e) => editDistanceAtMost2(e.norm, q)))
  if (fuzzy) return { pid: fuzzy.pid, name: fuzzy.name }

  return null
}
