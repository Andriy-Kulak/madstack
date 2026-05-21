---
name: fal-generate-video
description: Generate short videos with fal.ai from a required text prompt, with optional image, video, or audio references. Use when the user asks to create, render, generate, animate, or iterate on video ads, UGC clips, product videos, social videos, image-to-video, reference-to-video, or text-to-video; supports specifying duration, aspect ratio, model, resolution, seed, and reference media.
---

# fal Generate Video

Generate videos through the fal.ai MCP tools. Treat the text prompt as required input; image, video, and audio references are optional.

Default to vertical `9:16` unless the user specifies a different aspect ratio. Default to `5` seconds when duration is omitted, unless the user's prompt clearly implies a different supported duration.

## Requirements

- Use the configured fal.ai tool or local fal credentials.
- Use `FAL_KEY` only as an env var name. Never write real keys into the skill or project files.
- The fal.ai MCP/tool integration may not read `madstack/.env.local`; configure credentials where the integration expects them, or ensure `FAL_KEY` is exported in the environment that launches the tool.

## Workflow

1. Collect the prompt and settings.
   - Require a text prompt or enough user intent to write one.
   - Use the user-specified duration when present; otherwise use `5`.
   - Use `aspect_ratio: "9:16"` unless the user requests landscape, square, another ratio, or auto.
   - Use `generate_audio: false` unless the user explicitly asks for audio, sound effects, speech, music, or synchronized audio.
   - Preserve requested negatives such as no text, no watermark, no logos, no timestamps, or no captions in the prompt.

2. Choose the model.
   - If the user names a model or endpoint, use that model.
   - If the user asks for the established default or wants optional image/video references, prefer `bytedance/seedance-2.0/fast/reference-to-video`.
   - For open-ended requests without a model preference, call `recommend_model` for the current best fit, then choose a video model that matches the requested mode: text-to-video, image-to-video, or reference-to-video.
   - Before submitting, call `get_model_schema` for the selected endpoint and adapt parameter names/enums to the live schema.
   - For expensive or long generations, call `get_pricing` and briefly mention the unit price before running when useful.

3. Prepare reference media.
   - Accept public URLs directly when the selected schema supports URL inputs.
   - For local files, upload them to fal CDN with `upload_file` before submitting.
   - Use `image_urls`, `video_urls`, or `audio_urls` according to the schema.
   - In prompts for reference-to-video models, refer to uploaded references as `@Image1`, `@Video1`, or `@Audio1` when the schema/docs indicate that convention.
   - If no reference media is provided and the chosen reference-to-video schema allows optional references, submit text-only with no media arrays.

4. Submit the job.
   - Prefer `submit_job` for video generation so the request ID is available immediately.
   - Use `run_model` only for quick models or when the user explicitly wants a blocking run.
   - Set CDN expiration only when the user asks, or use a reasonable temporary value if the workflow needs one.
   - Poll with `check_job` until completed, then fetch the result with `action: "result"`.

5. Return the result.
   - Provide the video URL, request ID, seed if returned, endpoint, and important settings.
   - If generation fails, report the request ID, error, and the smallest useful adjustment to retry.

## Seedance Fast Defaults

For `bytedance/seedance-2.0/fast/reference-to-video`, the commonly useful input shape is:

```json
{
  "prompt": "Required video prompt",
  "aspect_ratio": "9:16",
  "duration": "5",
  "resolution": "720p",
  "generate_audio": false,
  "image_urls": [],
  "video_urls": [],
  "audio_urls": []
}
```

Only include media arrays that contain at least one URL. Keep `duration` as a string if the schema uses string enums.

## Prompt Shaping

When the user provides a rough video idea, rewrite it into a production prompt before submission:

- Start with format, aspect ratio, camera style, and aesthetic.
- Define subject, framing, foreground, background, and negative space.
- Specify action over the full duration, using exact timestamps that match the chosen duration.
- Add negative constraints for unwanted text, watermarks, logos, subtitles, UI, or brand marks.
- Keep child, medical, financial, and safety-sensitive content realistic and non-exploitative.

For ad or UGC clips, preserve creator-style language such as "smartphone camera," "raw UGC," "unpolished," or "authentic" when the user requests it.
