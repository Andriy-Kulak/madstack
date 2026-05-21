---
name: gemini-video-analyzer
description: Watch and analyze video files or public YouTube videos with the Gemini API. Use when the user provides a video file path or upload and asks to watch, describe, summarize, transcribe, answer questions about, or break down what happens in a video, especially second-by-second or scene-by-scene general analysis of screen recordings, demos, tutorials, meetings, walkthroughs, raw footage, or any non-ad-specific video request.
---

# Gemini Video Analyzer

Use this skill when the user gives a video and wants Gemini to inspect the actual audiovisual content. Keep the analysis neutral and shaped by the user's request. Do not use paid-social or ad teardown framing unless the user explicitly asks for ad analysis; for ad creative teardown, prefer `gemini-ad-video-analyzer`.

## Requirements

- Use `GEMINI_API_KEY` or `GOOGLE_API_KEY`; never write API keys into the skill or project files.
- Prefer the bundled TypeScript helper so the upload and Gemini request are reproducible.
- If dependencies are missing, ask the user to run `npm install` in the madstack repo.
- The helper reads `.env` and `.env.local` from the madstack repo root, plus exported shell env vars.

From the madstack repo:

```bash
npm run analyze-video -- /path/to/video.mp4 --mode general
```

For public YouTube videos:

```bash
npm run analyze-video -- "https://www.youtube.com/watch?v=..." --mode general
```

Run helper commands from the madstack repo root so npm can find the project dependencies.

## Workflow

1. Confirm the provided path or URL is a supported video input.
2. Run the helper with `--mode general` unless the user explicitly asks for an ad creative teardown.
3. If the user gives a specific analysis instruction, use `--prompt`, for example `--prompt "Give me a second-by-second breakdown of what happens."`
4. Return Gemini's analysis, lightly cleaning formatting if needed, without inventing details not present in the output.

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
- `--save analysis.md`: save the result to a file.

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
