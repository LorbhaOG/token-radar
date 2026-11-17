// Token Radar's model: one sealed snapshot in, one ranked board out.
//
// The radar ranks protocols whose DefiLlama record carries no token yet: the launches still to come.
// A protocol's implied value is what a token would be worth if its record stayed as it is, estimated
// from three things and nothing else:
//
//   1. its TVL, multiplied by what the market currently pays for $1 of TVL in its category. That
//      multiple is measured from the snapshot itself: the median market-cap-to-TVL ratio of the
//      category's live-token protocols, shrunk toward the whole market's median by sample size
//      ((n*median + K*global) / (n + K)), so a category with one peer cannot dominate.
//   2. its seven-day TVL growth, clamped, as a momentum multiplier.
//   3. how long it has run with no token yet, as a maturity multiplier: a protocol that has held
//      TVL for years has proven more than one that appeared last month.
//
// No protocol name is special-cased anywhere: the same three functions score every row, and the
// category multiple is a table computed at build time and published in the dashboard's Method view.
// Implied value is the entry's claim, never a price and never a prediction that a token arrives.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: published in the dashboard and printed beside every formula. */
export interface ModelConstants {
  /** How many live peers' weight a category median needs before it is trusted on its own. */
  shrink_k: number;
  /** The multiple used only when the snapshot carries no live-token protocol to measure one from. */
  fallback_multiple: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 4,
  fallback_multiple: 0.25,
  multiple_floor: 0.02,
  multiple_cap: 2.5,
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.65,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'radar-2 (peer multiples)';

/** The watchlist's size floor, applied to the early radar as well. */
export const MIN_TVL = 5_000_000;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  act: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  token_status: 'pre-token';
  implied_value_usd: number;
  farm_steps: string[];
  model: {
    version: string;
    category_multiple: number;
    category_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
}

/** The dashboard's view of one row. Farm steps stay structured so the page can show cost and time. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  category_peers: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: FarmStep[];
}

/** A live-token protocol: it trades already, so its market cap is a fact, not a model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** A pre-token protocol the ranking leaves out, and the record's reason. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** A category's measured multiple, as the Method view prints it. */
export interface Benchmark {
  category: string;
  peers: number;
  median_multiple: number;
  multiple: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  total_tvl_usd: number;
  median_implied_usd: number;
  top_share_pct: number;
  benchmarks: Benchmark[];
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The categories whose protocols are a wrapped, staked or bridged product of a token that trades. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A name ending in a release marker is a pool of another protocol: "Aave V3", "Uniswap 2.0". */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A wrapped or staked product, in a name rather than a category. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's own product, which trades under the exchange, not as a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

/** Why a pre-token protocol is not a launch candidate, or null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'its token already trades';
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return `a ${p.category} product, so a wrapper of a token that trades`;
  if (PRODUCT_WORD.test(p.name)) return 'a wrapped or staked product of a token that trades';
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol, not a launch of its own';
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange product, named for the exchange rather than a launch';
  return null;
}

/** Whether the radar ranks a protocol: pre-token, a real subject, and at or above the $5M input floor. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null && p.tvl_usd >= MIN_TVL;
}

/** The median of a sorted-or-not list of numbers; 0 for an empty list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The market's own multiples, measured from the snapshot: for every category, the median market
 * cap per $1 of TVL among protocols whose token trades, and how many protocols that median rests on.
 */
export function measureBenchmarks(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, { peers: number; median: number; multiple: number }> } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = ratios.get(key) ?? [];
    list.push(ratio);
    ratios.set(key, list);
  }
  const global = all.length > 0 ? median(all) : model.fallback_multiple;
  const byCategory = new Map<string, { peers: number; median: number; multiple: number }>();
  for (const [category, list] of ratios) {
    const catMedian = median(list);
    const shrunk = (list.length * catMedian + model.shrink_k * global) / (list.length + model.shrink_k);
    byCategory.set(category, {
      peers: list.length,
      median: catMedian,
      multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk)),
    });
  }
  return { global, byCategory };
}

/** The category multiple one protocol is scored at: its category's, shrunk to the global one. */
export function categoryMultiple(p: SnapshotProtocol, benchmarks: { global: number; byCategory: Map<string, { peers: number; median: number; multiple: number }> }, model: ModelConstants = MODEL): { multiple: number; peers: number; median: number } {
  const hit = p.category === null ? undefined : benchmarks.byCategory.get(p.category);
  if (hit === undefined) {
    return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, benchmarks.global)), peers: 0, median: benchmarks.global };
  }
  return { multiple: hit.multiple, peers: hit.peers, median: hit.median };
}

/** The three multipliers and the implied value one protocol gets. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  benchmarks: { global: number; byCategory: Map<string, { peers: number; median: number; multiple: number }> },
  model: ModelConstants = MODEL,
): { implied: number; age: number | null; growthPct: number; growthMult: number; maturityMult: number; multiple: number; peers: number } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const cat = categoryMultiple(p, benchmarks, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * cat.multiple * growthMult * maturityMult));
  return { implied, age, growthPct, growthMult, maturityMult, multiple: cat.multiple, peers: cat.peers };
}

/** The board's protocols: every rankable pre-token protocol, the watchlist and the early radar alike. */
export function boardSubjects(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isRankable(p));
}

/** The protocol's first chain, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(tvl: number): number {
  if (tvl >= 2_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 75_000_000) return 100;
  return 50;
}

/** An ordinary transaction's gas on the protocol's first chain, in whole dollars. */
function gasFor(chain: string): number {
  if (chain === 'Ethereum') return 6;
  if (chain === 'Solana') return 1;
  if (['Base', 'Arbitrum', 'Optimism', 'Polygon', 'BNB Chain', 'Avalanche', 'Monad', 'Hyperliquid L1'].includes(chain)) return 2;
  return 3;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one concrete action, with the capital and the chain written into it. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('capital allocator')) {
    return `Deposit $${capital} into ${name}'s highest-vintage vault on ${chain} and leave the shares working for the full hold.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and stake the LP token if it offers one.`;
  }
  if (c.includes('rwa') || c.includes('index')) {
    return `Buy or mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} into ${name}'s basis or delta-neutral strategy on ${chain} and let it run through a full funding cycle.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('btc')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('chain') || c.includes('payment') || c.includes('governance') || c.includes('card')) {
    return `Bridge $${capital} of USDC onto ${chain} through ${name} and use its own app for one swap and one deposit.`;
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('stable') || c.includes('wrapper')) {
    return `Deposit $${capital} through ${name} on ${chain} and keep the receipt token it issues.`;
  }
  if (c.includes('prediction')) return `Fund $${capital} and place one position on ${name} on ${chain}, then stop.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('otc') || c.includes('marketplace')) return `Complete one $${capital} trade through ${name} on ${chain} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open through the hold.`;
}

/**
 * A protocol's farm plan: eight steps, each with a cost and a time, derived from the protocol's own
 * record (category, chains, TVL, age). It covers the before-launch work and what to do on launch day.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(chain);
  const hold = holdDaysFor(age);
  return [
    {
      act: `Open a fresh wallet and fund it with only the capital you are willing to leave in ${p.name} for ${hold} days.`,
      cost: `about $${gas} of gas to fund it and approve the first contract`,
      time: '10 minutes',
    },
    {
      act: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '20 minutes to set up',
    },
    {
      act: `Repeat one qualifying action every week on ${chain}, such as a deposit, a borrow, a swap or a governance vote.`,
      cost: `about $${Math.max(1, Math.round(gas / 3))} of gas a week`,
      time: '10 minutes a week',
    },
    {
      act: `Hold the position for at least ${hold} days so the activity lands in more than one snapshot, and do not move it on a whim.`,
      cost: `$${capital} stays at risk in the position until you withdraw`,
      time: `${hold} days`,
    },
    {
      act: `Before any token exists, save the protocol's official points, terms and rewards page and claim only from that page.`,
      cost: 'free to check, and never pay a fee to claim',
      time: '10 minutes',
    },
    {
      act: `If a token launches, compare its fully diluted value with this board's implied value of ${p.name} before buying any of it.`,
      cost: 'no cost to compare; size any launch buy at 10% of your farm capital',
      time: '15 minutes on launch day',
    },
    {
      act: `Confirm the exit works with a small test withdrawal before the position grows, and check the token's unlock schedule.`,
      cost: `about $${gas} for the test withdrawal`,
      time: '10 minutes',
    },
    {
      act: `Write the wallet, the dates, every transaction and the unlock terms in a farm log so the position can be repeated or unwound.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.act} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and read the protocol's own terms.`;
  return s;
}

/** The ranked board: strongest implied value first, ranks 1..n, ties broken by slug. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const benchmarks = measureBenchmarks(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const scored = boardSubjects(snapshot).map((p) => {
    const v = impliedValue(p, snapshot.as_of, benchmarks, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    on_watchlist: watch.has(s.p.slug),
    token_status: 'pre-token',
    implied_value_usd: s.v.implied,
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
    model: {
      version: MODEL_VERSION,
      category_multiple: s.v.multiple,
      category_peers: s.v.peers,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
    },
  }));
}

/** The live-token protocols with the largest market caps, with each one's measured multiple. */
export function liveRows(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** The pre-token protocols the ranking leaves out, largest first, with the reason each is out. */
export function excludedRows(snapshot: Snapshot, limit = 18): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && exclusionReason(p) !== null && p.tvl_usd >= snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, limit)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p) ?? '' }));
}

/** The whole dashboard dataset, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const benchmarks = measureBenchmarks(snapshot, model);
  const board = buildBoard(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const table: Benchmark[] = [...benchmarks.byCategory.entries()]
    .map(([category, b]) => ({ category, peers: b.peers, median_multiple: round4(b.median), multiple: round4(b.multiple) }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const implied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const totalTvl = board.reduce((n, r) => n + r.tvl_usd, 0);
  const top10 = board.slice(0, 10).reduce((n, r) => n + r.implied_value_usd, 0);
  const totalImplied = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: { ...model },
    model_version: MODEL_VERSION,
    global_multiple: round4(benchmarks.global),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: liveRows(snapshot).length,
    excluded_size: snapshot.protocols.filter((p) => isPreToken(p) && exclusionReason(p) !== null && p.tvl_usd >= snapshot.floor_usd).length,
    total_tvl_usd: totalTvl,
    median_implied_usd: implied.length > 0 ? implied[implied.length >> 1]! : 0,
    top_share_pct: totalImplied > 0 ? Math.round((top10 / totalImplied) * 100) : 0,
    benchmarks: table,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      on_watchlist: r.on_watchlist,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      category_peers: r.model.category_peers,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      farm_steps: farmSteps(snapshot.protocols.find((p) => p.slug === r.slug)!, r.age_days),
    })),
    live: liveRows(snapshot),
    excluded: excludedRows(snapshot),
  };
  return { board, radar };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 a board needs`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}
