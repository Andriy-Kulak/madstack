---
name: meta-ad-library-scraper
description: Scrape and archive public Meta Ad Library pages for competitor creative research. Use when the user provides a Facebook or Meta Ads Library URL and asks to collect active ads, ad library IDs, ad copy, formats, static images, videos, previews, landing URLs, CTAs, platforms, page metadata, or an inspectable local gallery from publicly visible ads.
---

# Meta Ad Library Scraper

Use this skill for public competitor creative research from Meta Ad Library URLs. This is not for private ad account data, exact spend, exact performance, targeting, or changing campaigns.

## Requirements

- Run commands from the madstack repo root.
- Install dependencies with `npm install`; the scraper uses `playwright-core` with a local Chrome/Chromium executable for browser fallback.
- Do not use Apify or a managed scraping API by default.
- Do not store downloaded media unless the user explicitly asks for media downloads.
- If more than 100 ads are found and the user has not specified a download amount, stop after scraping metadata and ask how many ads they want to download.
- If Meta blocks, challenges, or changes the public payload, report the failure plainly.

## Quick Commands

Scrape a public Ads Library URL:

```bash
npm run meta-ads -- scrape-url "https://www.facebook.com/ads/library/?..." --limit all --json
```

Archive a URL into JSON, JSONL, downloaded media, manifest, and an HTML gallery:

```bash
npm run meta-ads -- archive-url "https://www.facebook.com/ads/library/?..." --out meta-files/brand
```

If a page has more than 100 ads, choose a download amount:

```bash
npm run meta-ads -- archive-url "https://www.facebook.com/ads/library/?..." --out meta-files/brand --download-limit 100
```

Download media from an existing scrape:

```bash
npm run meta-ads -- download-media meta-files/brand/ads.json --out meta-files/brand --max 100
```

Write JSONL:

```bash
npm run meta-ads -- scrape-url "https://www.facebook.com/ads/library/?..." --limit 100 --jsonl > meta-ads.jsonl
```

Run parser fixtures:

```bash
npm run meta-ads:test
```

## Workflow

1. Confirm the input is a `facebook.com/ads/library/` URL.
2. For a full local archive, run `archive-url`; for metadata only, run `scrape-url`.
3. If `archive-url` reports `needs_download_limit: true`, tell the user how many ads were found and ask how many to download before proceeding.
4. Check `metadata.complete`; if it is `false`, explain the `metadata.warnings`.
5. Use `ads[]` and `manifest.json` for factual fields only: library ID, copy, title, CTA, link, format, local image/video path, source media URL, platform list, and run dates.
6. If direct pagination fails and `metadata.browser_fallback_used` is `true`, the scraper recovered remaining ads by scrolling the public page in Chrome.
7. Do not infer performance from sort order, duration, or duplication unless labeled `(inferred)`.

## Outputs

`archive-url` writes:

- `ads.json`: full normalized scrape payload.
- `ads.jsonl`: one metadata line plus one ad per line.
- `manifest.json`: ad title, text, CTA, link, library ID, and local media paths.
- `index.html`: browsable gallery with local videos/static images and ad copy.
- `videos/`, `images/`, `previews/`: downloaded creative files named with ad order and `ad_archive_id`.

## Accuracy Rules

- Report only fields Meta exposes in the public payload.
- Do not claim exact spend, impressions, ROAS, CPA, targeting, or audience unless present in the payload.
- Preserve Meta's original ad text, including language and line breaks.
- Treat media URLs as temporary; they may expire or require fresh scraping.
