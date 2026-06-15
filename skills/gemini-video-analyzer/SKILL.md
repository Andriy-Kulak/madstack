---
name: gemini-video-analyzer
description: Watch and analyze video files or public YouTube videos with the Gemini API. Use when the user provides a video file path or upload and asks to watch, describe, summarize, transcribe, answer questions about, or break down what happens in a video, especially second-by-second or scene-by-scene general analysis of screen recordings, demos, tutorials, meetings, walkthroughs, raw footage, or any non-ad-specific video request.
---

# Gemini Video Analyzer

Use this skill when the user gives a video and wants Gemini to inspect the actual audiovisual content. Keep the analysis neutral and shaped by the user's request. Do not use paid-social or ad teardown framing unless the user explicitly asks for ad analysis; for ad creative teardown, prefer `gemini-ad-video-analyzer`.

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
npm run analyze-video -- /path/to/video.mp4 --mode general
```

## Workflow

1. Confirm the provided path or URL is a supported video input.
2. Call `check_video_analyzer_config` first when practical. If it reports missing configuration, stop and ask the user to configure the MCP server.
3. Call `analyze_video` with `mode: "general"` unless the user explicitly asks for an ad creative teardown.
4. If the user gives a specific analysis instruction, pass it as `prompt`, for example `Give me a second-by-second breakdown of what happens.`
5. Return the MCP analysis, lightly cleaning formatting if needed, without inventing details not present in the output.

## Accuracy Rules

- Only report what is actually visible or audible in the video.
- Do not invent narrators, voiceovers, speaker names, creator names, brands, claims, offers, or transcript lines.
- If no speech is audible, say "No speech detected." If the audio is silent or ambient only, say that plainly.
- Distinguish observed facts from interpretation. Label lower-confidence interpretation as `(inferred)`.
- Quote on-screen text and spoken lines only when readable or audible. If text/audio is unclear, say "unclear" rather than guessing.
- Prioritize accuracy over completeness.

## Useful Options

- `--mode general`: default detailed scene-by-scene video description.
- `--mode ad`: DTC ad creative teardown; prefer `gemini-ad-video-analyzer` for this workflow.
- `--prompt "..."`: custom question or output format.
- `--model gemini-3-flash-preview`: default model.
- `--fps 2`: higher frame sampling for fast edits or small on-screen text.
- `--start 12s --end 45s`: clip analysis to a segment.

When using MCP, pass these as tool arguments: `mode`, `prompt`, `model`, `fps`, `start`, and `end`.

## General Output Defaults

When the user does not specify a format, prefer:

1. Concise Summary
2. Timeline / Scene-by-Scene Breakdown
3. Audio Report / Transcript
4. On-Screen Text
5. Key Visual Details
6. Key Moments
7. Unclear or Uncertain Parts

Include timestamps whenever Gemini provides or can infer them. In the audio section, include a transcript with timestamps only if speech is actually audible; otherwise state no speech detected, silent audio, ambient-only audio, music, or unclear audio. Call out uncertainty when small text, fast edits, or muffled audio are hard to read.
