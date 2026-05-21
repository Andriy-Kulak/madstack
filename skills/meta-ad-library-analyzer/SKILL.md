---
name: meta-ad-library-analyzer
description: Analyze a local Meta Ad Library archive of downloaded videos and static ads with Gemini, then produce marketer-ready reports covering business positioning, problem-solution, awareness stages, ad angles, creative patterns, hooks, claims, objections, and reusable source material for new ad scripts.
---

# Meta Ad Library Analyzer

Use this skill after `meta-ad-library-scraper` has archived a public Meta Ads Library page into a local folder such as `meta-files/brand-media`.

This skill turns local ad media and copy into a strategic creative report for growth teams and for downstream LLMs that will write hooks, UGC scripts, and ad concepts for another brand.

## Requirements

- Run commands from the madstack repo root.
- Use `GEMINI_API_KEY` or `GOOGLE_API_KEY`; never write keys into repo files or chat.
- Keep generated reports and media under `meta-files/` or another ignored output directory.
- Load `references/creative-framework.md` when adjusting prompts, report sections, awareness-stage logic, or angle taxonomy.

## Quick Commands

Analyze a local archive:

```bash
npm run meta-ads:analyze -- meta-files/sonito-media --out meta-files/sonito-analysis
```

Limit the run for a smoke test:

```bash
npm run meta-ads:analyze -- meta-files/sonito-media --out meta-files/sonito-analysis-smoke --limit 3
```

Force re-analysis instead of using cached per-ad JSON:

```bash
npm run meta-ads:analyze -- meta-files/sonito-media --out meta-files/sonito-analysis --force
```

Run fixture tests without Gemini:

```bash
npm run meta-ads:analyze:test
```

## Workflow

1. Confirm the input directory contains `manifest.json` from `meta-ad-library-scraper`.
2. Run the analyzer with an ignored output directory.
3. If the archive has more than 100 creatives and the user has not specified `--limit`, stop and ask how many to analyze.
4. Review `report.md` first, then use `index.html` to inspect each ad beside its media and analysis.
5. Use `report.json` when another script or LLM needs structured source material for hooks, scripts, or angle generation.

## Outputs

- `report.md`: strategic marketer report with business analysis, problem-solution, angle clusters, awareness stages, patterns, recommendations, and per-ad details.
- `report.json`: structured report data for apps and downstream generation.
- `index.html`: local gallery with media, copy, library IDs, and analysis excerpts.
- `analysis/ads/<ad_archive_id>.json`: cached per-ad analysis.

## Accuracy Rules

- Report only what is visible, audible, or present in Meta metadata.
- Label interpretation as `(inferred)` when it is not directly visible or audible.
- Do not invent spend, impressions, conversion performance, targeting, or exact audience segments.
- Preserve ad copy as source material; do not rewrite it unless a report section explicitly asks for derived hooks or script ideas.
- For script-generation handoff, separate observed claims/proof from recommended claims the brand would still need to substantiate.
