# Onboarding to madstack

madstack is easiest to learn one capability at a time. Start with the repo checks, then unlock provider credentials only when a workflow needs them.

## 10-Minute Setup

```bash
git clone https://github.com/Andriy-Kulak/madstack.git
cd madstack
npm install
./setup --host codex
npm run check
npm run doctor
```

`./setup --host codex` symlinks the repo skills into `~/.codex/skills`. The source of truth stays in this repo, so changes to `skills/*/SKILL.md` are picked up through the symlink.

## Using madstack with Codex

Open Codex in this repo and start with a direct intent:

```text
What madstack skills are available, and which one should I use for video analysis?
```

Codex should read `AGENTS.md`, then route work to the provider-specific skills:

- `gemini-video-analyzer` for general video summaries, transcripts, and scene breakdowns.
- `gemini-ad-video-analyzer` for paid-social ad teardown, hooks, angles, CTAs, and creative review.
- `fal-generate-video` for fal.ai social or ad video generation.
- `meta-ad-library-scraper` for public Meta Ads Library scraping and local creative galleries.
- `google-ads-analyze` for read-only Google Ads API account and campaign analysis.

## Skill Tiers

Start new users with the lowest-friction workflows first.

| Tier | Skills | Setup |
|---|---|---|
| No account credentials | `meta-ad-library-scraper` | `npm install`, local Chrome/Chromium for browser fallback |
| One API key | `gemini-video-analyzer`, `gemini-ad-video-analyzer` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Paid generation | `fal-generate-video` | A configured fal.ai MCP/tool integration, or `FAL_KEY` in the environment used by that tool |
| Advanced OAuth | `google-ads-analyze` | Google Ads developer token, OAuth client, refresh token, and customer IDs |

## Environment Variables

Create local env values from the example file:

```bash
cp .env.example .env.local
```

Fill only the variables needed for the workflow you are using. Never paste real keys into chat, docs, examples, issues, commits, or skill files.

Repo-local helper commands read `.env` and `.env.local` when run from the madstack repo root. Environment variables exported in the shell override file values.

The installed Codex skills are symlinks to this repo, but installing a skill does not make `.env.local` global. If a skill tells Codex to run an `npm run ...` helper from this repo, that helper can read this repo's `.env.local`.

`fal-generate-video` normally uses the fal.ai MCP/tool integration. That integration may run outside this repo's helper commands, so do not assume it will read `madstack/.env.local`. Configure fal credentials wherever the fal MCP/tool expects them, or export `FAL_KEY` in the environment that launches the tool.

## First Successful Tasks

Metadata-only Meta Ads Library scrape:

```text
Use madstack to scrape this public Meta Ads Library URL as JSON. Do not download media unless I ask.
```

General video analysis:

```text
Use madstack to summarize this video and give me a scene-by-scene breakdown: /path/to/video.mp4
```

Ad creative teardown:

```text
Use madstack to analyze this as a paid social ad, including hook, angle, CTA, and what is weak: /path/to/ad.mp4
```

fal.ai generation:

```text
Use madstack to generate a 5-second vertical UGC-style video ad. Tell me the model, settings, and expected cost before submitting.
```

Google Ads API check:

```text
Use madstack to list accessible Google Ads accounts.
```

## Doctor Checks

Run all checks:

```bash
npm run doctor
```

Run a provider-specific check:

```bash
npm run doctor -- gemini
npm run doctor -- fal
npm run doctor -- meta
npm run doctor -- google-ads
```

The doctor command reports whether required local setup is present without printing secret values.

## Troubleshooting

- If Codex does not find the skills, run `./setup --host codex` again from the repo root.
- If a Gemini command says the key is missing, check `.env.local` for `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- If fal.ai generation cannot authenticate, configure the fal.ai MCP/tool integration or make sure `FAL_KEY` is exported in the environment that launches it.
- If Meta scraping falls back to a browser and fails to launch, install Chrome/Chromium or set `CHROME_PATH`.
- If Google Ads OAuth fails, confirm the OAuth client redirect URI is `http://localhost:8080/oauth2callback`.
