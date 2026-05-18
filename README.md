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
| `google-ads-analyze` | Google Ads API | Account, campaign, and performance analysis from Google Ads API data |

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

## Secrets

Copy `.env.example` to your local environment if you need one, but never commit `.env`.

The skills only document env var names:

```bash
GEMINI_API_KEY=
GOOGLE_API_KEY=
FAL_KEY=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_CUSTOMER_ID=
```

Never put real API keys in `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, scripts, examples, commits, issues, or chat transcripts.

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
