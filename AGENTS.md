# madstack Agent Instructions

madstack is a Marketing Ad & Growth Stack of Skills. Use it for ad creative analysis, video analysis, video generation, UGC concepts, paid-social reviews, and growth workflows.

## Canonical Rules

- Treat this file as the canonical agent instruction file for the repo.
- Prefer the provider-specific skills in `skills/` when the user asks for video analysis, ad teardown, video generation, Meta Ad Library scraping, or Google Ads API analysis.
- Prefer TypeScript for reusable scripts, API helpers, validators, and transformations.
- Shell commands are fine when they are the clearest interface to an installed CLI, agent tool, or short setup step.
- Keep the repo portable. Do not reference private local skill paths such as a user's home-directory Codex skill install.
- When opening pull requests, create regular ready-for-review PRs by default. Do not create draft PRs unless the user explicitly asks for a draft.

## Skill Selection

| User Intent | Skill |
|---|---|
| General video summary, scene breakdown, transcript, or visual inspection | `gemini-video-analyzer` |
| Paid-social teardown, UGC review, hook/angle/CTA analysis, or steal-worthy patterns | `gemini-ad-video-analyzer` |
| Generate or iterate on short social/ad videos with fal.ai | `fal-generate-video` |
| Public Meta Ads Library URL scraping for ad IDs, copy, image/video URLs, formats, CTAs, and landing URLs | `meta-ad-library-scraper` |
| Google Ads account, campaign, or performance analysis through the Google Ads API | `google-ads-analyze` |

## Secret Safety

- Never write, print, commit, store, or log real API keys.
- Never put keys in `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, scripts, examples, commits, issues, or chat.
- Only refer to env var names such as `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `FAL_KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, and `GOOGLE_ADS_CUSTOMER_ID`.
- If a required key is missing, ask the user to configure it locally. Do not ask them to paste the raw key into chat.
- Do not commit `.env`, `.env.*`, local media, generated video files, or analysis outputs.

## Accuracy Rules

- For video analysis, report only what is visible or audible.
- Do not invent narrators, voiceovers, speaker names, brands, claims, offers, transcript lines, or on-screen text.
- Mark low-confidence interpretation as `(inferred)`.
- If audio is silent, ambient-only, music-only, or unclear, say so plainly.
