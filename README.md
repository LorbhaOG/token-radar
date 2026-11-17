# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/LorbhaOG/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/LorbhaOG/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A launch radar for protocols whose token does not exist yet. It reads a sealed
DefiLlama snapshot, ranks every tokenless protocol by the value a token launch
could carry, and gives each one a farm plan with concrete costs and times.

An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01)
bounty.

## What it does

- **Finds the tokenless protocols.** 198 of the snapshot's 758 protocols record no
  token on DefiLlama and are not a wrapped, staked, bridged, exchange or versioned
  product of one that trades. All 40 watchlist protocols are ranked, plus 158
  protocols the watchlist leaves out, down to the snapshot's $5M input floor.
- **Values them from the snapshot alone.** Implied value is
  `TVL x m(category) x momentum x maturity`: the market's own median market-cap-to-TVL
  ratio for the category (shrunk toward the whole market's median by peer count), the
  seven-day TVL change clamped and weighted, and how long the protocol has run with no
  token. No protocol name is special-cased, and every category multiple is published in
  the dashboard's Method view.
- **Shows the comparables.** Protocols whose token already trades are kept apart, with
  their measured multiple, so the pre-token ranking is never mixed with live market caps.
- **Plans the farm.** Each of the 198 rows carries an eight-step plan: capital sized to
  TVL, gas per chain, a hold window fitted to the protocol's age, the weekly action that
  counts, and what to do on launch day. Every step states its cost and its time.

## The dashboard

`dashboard/` is a static page with no framework and no network: three files, all
rendered from `data.js` beside it. It has the ranked board with search, category and
scope filters and sortable columns; a detail drawer for every protocol with the model's
derivation, a sensitivity read and the full farm plan; a live-token comparables view; and
a Method view with the benchmark table and the exclusion rules.

## Run it

The grader runs `main.ts` on Node 22 with the sealed snapshot at `/input` and a writable
`/output`:

```sh
node main.ts
```

Outside the grader, point it at a snapshot and an output directory:

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json` (the last via the vendored `vendor/makefun-board.ts`). Two runs write
the same bytes.

## Layout

```text
main.ts                 the program: snapshot in, board + dashboard + dossier out
lib/model.ts            the value model, the ranking and the farm plans
vendor/makefun-board.ts make.fun's dossier library, as shipped in the kit
dashboard/              index.html, app.css, app.js: the static page
screenshots/            the board, a detail view, a filtered view
```

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
