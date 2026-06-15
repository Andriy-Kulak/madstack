---
name: x-growth-radar
description: Find and rank interesting X/Twitter posts and emerging voices about growth marketing, AI ads, creative automation, ad-tech workflows, and high-attention growth technology using the xAI API. Use when the user asks for growth/AI ads tweet discovery, daily X reports, above-average attention posts, seed-handle exploration, or evolving parameters for finding new growth-tech voices.
---

# X Growth Radar

Use this skill to discover interesting X posts and voices in growth marketing, AI ads, creative automation, UGC systems, ad-tech workflows, and adjacent AI growth tooling.

## Requirements

- Run commands from the madstack repo root.
- Use local environment variables only. Never print, write, commit, or ask the user to paste real API keys.
- The helper reads `.env`, `.env.local`, and exported shell env vars.
- Required:

```bash
XAI_API_KEY=
```

- The skill uses xAI Responses API with the `x_search` tool. Keep findings tied to cited X URLs.
- Treat like/discovery thresholds as tuning parameters, not truth. If metrics are missing or uncertain, say so.

## Quick Commands

Run the default daily radar with Riley Brown as the seed account:

```bash
npm run x-growth-radar -- daily --seed rileybrown
```

Use a wider seed set, a 14-day window, and stricter attention threshold:

```bash
npm run x-growth-radar -- daily --seed rileybrown,anotherhandle --days 14 --min-likes 100
```

Emit structured JSON for downstream analysis:

```bash
npm run x-growth-radar -- daily --seed rileybrown --json
```

Save both Markdown and JSON report files:

```bash
npm run x-growth-radar -- daily --seed rileybrown --out outputs/x-growth-radar
```

Run the local non-API smoke test:

```bash
npm run x-growth-radar:test
```

## Parameters To Tune

- `--seed`: comma-separated handles to anchor exploration. Default: `rileybrown`.
- `--days`: lookback window. Default: `7`.
- `--min-likes`: minimum useful engagement floor. Default: `50`.
- `--above-average-multiple`: how much stronger than the author's baseline a post should appear. Default: `1.5`.
- `--limit`: number of ranked posts to return. Default: `12`.
- `--topics`: comma-separated topic override. Default topics cover growth marketing, AI ads, paid social creative, UGC automation, AI landing pages, ad generation, creative testing, attribution, and growth tech.
- `--include-media`: enable image/video understanding for media-heavy posts.
- `--model`: xAI model override. Default: `grok-4.3`.

## Workflow

1. Start with `daily --seed rileybrown --days 7 --min-likes 50`.
2. Review the report for three things: genuinely useful tactical posts, emerging voices worth following, and recurring tooling/market shifts.
3. Tighten or loosen `--min-likes`, `--above-average-multiple`, and `--topics` based on the quality of the finds.
4. Prefer posts that contain a specific tactic, workflow, teardown, dataset, experiment result, prompt, tool launch, or contrarian read.
5. Down-rank generic AI hype, engagement bait, broad motivational posts, obvious mega-account news, and uncited claims.
6. Keep the "next parameters" from each run and use them as the starting point for the next daily report.

## Reporting Rules

- Report only what the xAI/X search result supports.
- Include cited X URLs for every selected post when available.
- Mark uncertain metrics, author baselines, or inferred reasons as `(inferred)`.
- Do not invent exact likes, retweets, dates, handles, claims, screenshots, or offers.
- If the search cannot retrieve enough relevant posts, report that plainly and suggest the next parameter change.
