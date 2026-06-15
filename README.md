# madstack

**Marketing Ad & Growth Stack of Skills.**

madstack is a small public skill pack for ad creative, video analysis, video generation, and growth workflows. It is inspired by Garry Tan's `gstack`, but focused on marketing work instead of software delivery.

The repo starts Codex-first and stays compatible with Claude Code. `AGENTS.md` is the canonical agent instruction file; `CLAUDE.md` points Claude Code back to it.

## Skills

| Skill | Provider | Use For |
|---|---|---|
| `gemini-video-analyzer` | Gemini | General video summaries, transcripts, scene breakdowns |
| `gemini-ad-video-analyzer` | Gemini | Ad teardowns, hooks, angles, CTAs, steal-worthy patterns |
| `fal-generate-video` | fal.ai | Text-to-video, image-to-video, reference-to-video ad/social clips |
| `meta-ad-library-scraper` | Meta Ad Library | Public ad IDs, copy, formats, image/video URLs, CTAs, landing URLs |
| `google-ads-analyze` | Google Ads API | Account, campaign, and performance analysis from Google Ads API data |
| `x-growth-radar` | xAI X Search | Interesting growth/AI ads posts, emerging voices, and daily radar reports |

## Install

Clone the repo locally:

```bash
git clone https://github.com/Andriy-Kulak/madstack.git /Users/andriykulak/repos/madstack
cd /Users/andriykulak/repos/madstack
npm install
```

Install skills for Codex:

```bash
./setup --host codex
```

Install skills for Claude Code:

```bash
./setup --host claude
```

Install both:

```bash
./setup --host all
```

Codex can also discover the repo-local skill links under `.agents/skills/`.

For a staged new-user flow, see [ONBOARDING.md](ONBOARDING.md).

Quick health checks:

```bash
npm run check
npm run doctor
```

## Secrets

Copy `.env.example` to your local environment if you need one, but never commit `.env`.

The skills only document env var names:

```bash
GEMINI_API_KEY=
GOOGLE_API_KEY=
FAL_KEY=
XAI_API_KEY=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_CUSTOMER_ID=
```

Never put real API keys in `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, scripts, examples, commits, issues, or chat transcripts.

Installed skills are symlinks to this repo. Installing the skills does not make `.env.local` global; repo-local helper commands read `.env.local` when Codex runs them from the madstack repo root. Hosted or MCP-backed provider tools may need their own configuration.

`fal-generate-video` normally uses the fal.ai MCP/tool integration. Configure fal credentials where that integration expects them, or export `FAL_KEY` in the environment that launches the tool; do not assume the fal MCP reads `madstack/.env.local`.

## Video Analyzer MCP

madstack includes a local MCP server for Gemini-backed video analysis. This lets agents call a typed MCP tool instead of knowing how to run the helper script or where local `.env` files live.

Install or update the repo:

```bash
git clone https://github.com/Andriy-Kulak/madstack.git /path/to/madstack
cd /path/to/madstack
npm install
```

Add the MCP server to your client config. Put the API key in the MCP server `env` block; do not commit it to this repo or paste it into chat.

```json
{
  "mcpServers": {
    "madstack-video-analyzer": {
      "command": "/path/to/madstack/node_modules/.bin/tsx",
      "args": ["/path/to/madstack/mcp/video-analyzer-server.ts"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Use `GOOGLE_API_KEY` instead of `GEMINI_API_KEY` if that is how your Gemini key is named.

The MCP server exposes:

| Tool | Purpose |
|---|---|
| `analyze_video` | Analyze a local video file or public YouTube URL with Gemini |
| `check_video_analyzer_config` | Confirm the server has a Gemini key without revealing it |
| `list_supported_video_extensions` | Show accepted local video extensions |

Local smoke test:

```bash
npm run mcp:video-analyzer:smoke
```

The smoke test starts the MCP server, lists its tools, and verifies the config check does not leak the placeholder key. It does not call Gemini or upload video.

## Onboarding Path

Start new users with the lowest-friction workflow first:

| Tier | Skills | Setup |
|---|---|---|
| No account credentials | `meta-ad-library-scraper` | `npm install`, Chrome/Chromium for browser fallback |
| One API key | `gemini-video-analyzer`, `gemini-ad-video-analyzer` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| One X/search API key | `x-growth-radar` | `XAI_API_KEY` |
| Paid generation | `fal-generate-video` | Configured fal.ai MCP/tool integration, or `FAL_KEY` in that tool's environment |
| Advanced OAuth | `google-ads-analyze` | Google Ads developer token, OAuth client, refresh token, customer IDs |

Useful Codex starter prompts:

```text
What madstack skills are available, and which one should I use for video analysis?
```

```text
Use madstack to analyze this video as a paid social ad: /path/to/video.mp4
```

```text
Use madstack to scrape this public Meta Ads Library URL and create a local gallery.
```

```text
Use madstack to find interesting X posts and emerging voices about growth marketing and AI ads.
```

## X Growth Radar

Use `x-growth-radar` for a daily X report about growth marketing, AI ads, creative automation, and emerging growth-tech voices. It calls the xAI Responses API with the X Search tool and keeps the tunable parameters visible in every report.

Run the default seed search:

```bash
npm run x-growth-radar -- daily --seed rileybrown
```

Adjust the quality bar:

```bash
npm run x-growth-radar -- daily --seed rileybrown --days 14 --min-likes 100 --above-average-multiple 2
```

Write Markdown and JSON report files:

```bash
npm run x-growth-radar -- daily --seed rileybrown --out outputs/x-growth-radar
```

## Meta Ad Library Scraping

Use `meta-ad-library-scraper` for public competitor creative research from a Meta Ads Library URL:

```bash
npm run meta-ads -- scrape-url "https://www.facebook.com/ads/library/?..." --limit all --json
```

To create an inspectable local archive with downloaded videos/static images, a manifest, and an HTML gallery:

```bash
npm run meta-ads -- archive-url "https://www.facebook.com/ads/library/?..." --out meta-files/brand
```

The scraper returns public metadata only: ad library IDs, copy, titles, CTAs, landing URLs, formats, image/video URLs, platforms, page metadata, and run dates when Meta exposes them. It uses `playwright-core` with local Chrome/Chromium as a browser fallback when Meta rejects direct pagination. If more than 100 ads are found, choose a download amount with `--download-limit N` or explicitly pass `--yes`. It does not provide exact spend, exact impressions, targeting, or private ad account data.

## Google Ads API Setup

Use `google-ads-analyze` when you want account and campaign data from the Google Ads API. Each user should bring their own Google Ads account, Google Cloud OAuth client, and local `.env.local`.

Create a local env file:

```bash
cp .env.example .env.local
```

Fill only local values:

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_CUSTOMER_ID=
```

### 1. Get a Developer Token

1. Open Google Ads.
2. Use a manager account when possible.
3. Go to **Tools & Settings -> Setup -> API Center**.
4. Copy the developer token into `GOOGLE_ADS_DEVELOPER_TOKEN`.

Explorer Access is enough for basic analysis while developing. Higher access levels mainly affect quota and production use.

### 2. Create an OAuth Client

1. Open Google Cloud Console.
2. Select or create a project.
3. Enable the **Google Ads API**.
4. Go to **APIs & Services -> Credentials**.
5. Create an **OAuth client ID** with type **Web application**.
6. Add this authorized redirect URI for the local helper flow:

```text
http://localhost:8080/oauth2callback
```

7. Put the generated client ID and client secret into:

```bash
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
```

### 3. Generate a Refresh Token

The OAuth scope is:

```text
https://www.googleapis.com/auth/adwords
```

Generate the refresh token with the OAuth client above:

```bash
npm run google-ads:oauth
```

Open the printed URL in a browser, approve the Google Ads scope, and the helper will save the resulting token locally:

```bash
GOOGLE_ADS_REFRESH_TOKEN=
```

Do not use the scope URL itself as the refresh token. A real refresh token is a long secret string and is usually prefixed with `1//`.

### 4. Set Customer IDs

Use 10-digit Google Ads customer IDs with hyphens removed:

```bash
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
GOOGLE_ADS_CUSTOMER_ID=0987654321
```

`GOOGLE_ADS_LOGIN_CUSTOMER_ID` is usually the manager account ID. `GOOGLE_ADS_CUSTOMER_ID` is the account you want to analyze. They can be the same for non-manager setups.

### 5. Test Access

List accessible accounts:

```bash
npm run google-ads -- accounts
```

List campaigns for one account:

```bash
npm run google-ads -- campaigns --customer 0987654321
```

Pull campaign performance:

```bash
npm run google-ads -- performance --customer 0987654321 --from 2026-05-01 --to 2026-05-18
```

Add `--json` when another agent or script should consume the output.

## Check

```bash
npm run check
```

The check validates skill frontmatter and scans for common secret patterns and local absolute paths.
