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

## Install

Clone the repo locally:

```bash
git clone https://github.com/Andriy-Kulak/madstack.git /Users/andriykulak/repos/madstack
cd /Users/andriykulak/repos/madstack
bun install
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
```

Never put real API keys in `README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, scripts, examples, commits, issues, or chat transcripts.

## Check

```bash
bun run check
```

The check validates skill frontmatter and scans for common secret patterns and local absolute paths.
