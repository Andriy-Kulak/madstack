---
name: google-ads-analyze
description: Analyze Google Ads accounts through the Google Ads API. Use when the user asks to list accessible Google Ads accounts, inspect campaigns or sub-accounts, pull campaign performance, audit spend, CPA, conversions, CTR, CPC, ROAS, budget pacing, or prepare account optimization recommendations from API data.
---

# Google Ads Analyze

Use this skill when the user wants Google Ads data from the API, not screenshots or UI scraping.

## Requirements

Use local environment variables only. Never print, write into docs, commit, or ask the user to paste real credential values in chat.

The helper scripts read `.env` and `.env.local` from the madstack repo root, plus exported shell env vars.

Required:

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
```

Optional:

```bash
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_API_VERSION=v21
```

`GOOGLE_ADS_LOGIN_CUSTOMER_ID` should be the manager account ID when querying a child account. Strip hyphens from all customer IDs.

## Quick Commands

From the madstack repo:

Generate and save a refresh token after `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET` are configured:

```bash
npm run google-ads:oauth
```

The OAuth client must allow this redirect URI:

```text
http://localhost:8080/oauth2callback
```

List accessible accounts:

```bash
npm run google-ads -- accounts
```

List campaigns for a customer:

```bash
npm run google-ads -- campaigns --customer 2239799476
```

Pull campaign performance:

```bash
npm run google-ads -- performance --customer 2239799476 --from 2026-05-01 --to 2026-05-18
```

Add `--json` when downstream analysis needs structured data.

## Workflow

1. If the user names an account like `223-979-9476`, normalize it to `2239799476`.
2. Run `accounts` first when the target customer ID is unknown.
3. Use `campaigns` to confirm campaign ownership, status, channel type, and budgets.
4. Use `performance` for spend, clicks, conversions, CPA, CTR, CPC, and conversion value over a requested date range.
5. Keep analysis factual. Label recommendations and causes as `(inferred)` unless directly supported by API data.
6. For destructive or mutating actions such as pausing campaigns or changing budgets, stop and ask for explicit confirmation. This skill is read-only by default.

## Analysis Rules

- Prefer API data over Google Ads UI screenshots.
- State the exact customer ID and date range used.
- Do not claim who created a campaign unless the API data explicitly supports it. Campaign ownership by customer ID is not the same as user-level creator attribution.
- Convert `cost_micros` to account currency units by dividing by 1,000,000.
- Mention when removed campaigns are included.
- If OAuth or API access fails, report the failing class only: missing env var, OAuth refresh failure, inaccessible customer, developer-token/access-level issue, or malformed query.
