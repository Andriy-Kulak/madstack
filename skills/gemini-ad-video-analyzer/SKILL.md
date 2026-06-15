---
name: gemini-ad-video-analyzer
description: Analyze ad videos with the Gemini API as a paid-social creative strategist. Use when the user provides a video file path or upload and asks for ad analysis, UGC ad review, Meta ad teardown, Google ad teardown, creative breakdown, hook analysis, angle analysis, CTA review, second-by-second ad breakdown, what works, what's weak, swipe-worthy or steal-worthy patterns, or wants to study why a video ad works.
---

# Gemini Ad Video Analyzer

Use this skill when the user gives a video and wants an ad-specific creative teardown. This is the paid-social/DTC specialist version of `gemini-video-analyzer`; analyze the video as advertising, not just as footage.

## Requirements

- Prefer the local MCP server named `gemini-video-analyzer`.
- The MCP server must expose these tools: `check_video_analyzer_config`, `analyze_video`, and `list_supported_video_extensions`.
- The Gemini API key belongs in the MCP server configuration, not in the skill, prompt, repo files, or chat.
- Never write, print, commit, store, or log real API keys.
- Do not use the bundled TypeScript helper unless the user explicitly asks for a non-MCP fallback.

If the `gemini-video-analyzer` MCP server is not available in the active tool list, tell the user:

```text
The gemini-video-analyzer MCP server is not available in this Codex session. Please add or enable the MCP server, configure GEMINI_API_KEY or GOOGLE_API_KEY in the MCP server's environment, then restart or reload Codex.
```

If `check_video_analyzer_config` reports that the key is missing, tell the user:

```text
The gemini-video-analyzer MCP server is installed, but its Gemini API key is not configured. Add GEMINI_API_KEY or GOOGLE_API_KEY to the MCP server's environment variables.
```

The repo still includes a CLI helper for manual debugging:

```bash
npm run analyze-video -- /path/to/video.mp4 --mode ad
```

## Workflow

1. Confirm the provided path or URL is a supported video input.
2. Call `check_video_analyzer_config` first when practical. If it reports missing configuration, stop and ask the user to configure the MCP server.
3. Call `analyze_video` with `mode: "ad"`, adding `fps: 2` for fast-cut ads or tiny text.
4. If the user asks for a particular lens, pass it as `prompt`, but keep the output ad-specific.
5. Return the MCP analysis, lightly cleaning formatting if needed, without inventing details not present in the output.

## Accuracy Rules

- Only report what is actually visible or audible in the video.
- Do not invent narrators, voiceovers, speaker names, creator names, brands, claims, offers, or transcript lines.
- If no speech is audible, say "No speech detected." If the audio is silent or ambient only, say that plainly.
- Distinguish observed facts from interpretation. Label lower-confidence interpretation as `(inferred)`.
- Quote on-screen text and spoken lines only when readable or audible. If text/audio is unclear, say "unclear" rather than guessing.
- Prioritize accuracy over completeness.

## Output Shape

Preserve this structure for detailed ad breakdowns:

1. One-Sentence Summary
2. Product, Offer, and Audience
3. Timeline / Scene-by-Scene Breakdown
4. Hook
5. Creative Angle
6. Visual System
7. Audio / Voiceover / Captions
8. Proof, Claims, and Objections
9. CTA
10. What This Ad Does Well
11. What's Weak
12. Steal-Worthy Patterns

Include timestamps whenever Gemini provides or can infer them. In the audio section, include a transcript with timestamps only if speech is actually audible; otherwise state no speech detected, silent audio, ambient-only audio, music, or unclear audio.

## Useful Options

- `--prompt "..."`: custom ad-analysis lens or output format.
- `--fps 2`: higher frame sampling for fast edits or small on-screen text.
- `--start 12s --end 45s`: analyze only a segment.
- `--model gemini-2.5-flash`: fallback if the default preview model is unavailable.

When using MCP, pass these as tool arguments: `mode`, `prompt`, `model`, `fps`, `start`, and `end`.
