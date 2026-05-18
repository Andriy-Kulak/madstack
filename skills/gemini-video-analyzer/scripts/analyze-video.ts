#!/usr/bin/env tsx
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";

type Mode = "general" | "ad";

interface Options {
  input: string;
  mode: Mode;
  prompt?: string;
  model: string;
  fps?: number;
  start?: string;
  end?: string;
  save?: string;
}

const mimeByExt: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".m4v": "video/x-m4v",
  ".3gpp": "video/3gpp",
  ".3gp": "video/3gpp",
};

function usage(): never {
  console.error(`Usage: npm run analyze-video -- <video-path-or-youtube-url> [options]

Options:
  --mode general|ad
  --prompt "custom question or output format"
  --model gemini-3-flash-preview
  --fps 2
  --start 12s
  --end 45s
  --save analysis.md`);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const input = argv[0];
  if (!input || input.startsWith("--")) usage();

  const opts: Options = {
    input,
    mode: "general",
    model: "gemini-3-flash-preview",
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--mode":
        if (next !== "general" && next !== "ad") usage();
        opts.mode = next;
        i++;
        break;
      case "--prompt":
        if (!next) usage();
        opts.prompt = next;
        i++;
        break;
      case "--model":
        if (!next) usage();
        opts.model = next;
        i++;
        break;
      case "--fps":
        if (!next || Number.isNaN(Number(next))) usage();
        opts.fps = Number(next);
        i++;
        break;
      case "--start":
        if (!next) usage();
        opts.start = next;
        i++;
        break;
      case "--end":
        if (!next) usage();
        opts.end = next;
        i++;
        break;
      case "--save":
        if (!next) usage();
        opts.save = next;
        i++;
        break;
      default:
        usage();
    }
  }

  return opts;
}

function isYouTubeUrl(input: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
}

function basePrompt(mode: Mode): string {
  if (mode === "ad") {
    return `Analyze this video as a paid-social ad creative strategist.

Return:
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

Only report what is visible or audible. If speech, text, or details are unclear, say unclear rather than guessing.`;
  }

  return `Analyze this video neutrally.

Return:
1. Concise Summary
2. Timeline / Scene-by-Scene Breakdown
3. Audio Report / Transcript
4. On-Screen Text
5. Key Visual Details
6. Key Moments
7. Unclear or Uncertain Parts

Only report what is visible or audible. If speech, text, or details are unclear, say unclear rather than guessing.`;
}

function videoMetadata(opts: Options): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  if (opts.start) metadata.startOffset = opts.start;
  if (opts.end) metadata.endOffset = opts.end;
  if (opts.fps) metadata.fps = opts.fps;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function textFromResponse(response: unknown): string {
  const maybe = response as { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  if (typeof maybe.text === "string") return maybe.text;
  const parts = maybe.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  return parts.map((part) => part.text).filter(Boolean).join("\n").trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY. Configure it locally; do not paste keys into chat or repo files.");
  }

  const prompt = [basePrompt(opts.mode), opts.prompt].filter(Boolean).join("\n\nAdditional user instruction:\n");
  const ai = new GoogleGenAI({ apiKey });
  const metadata = videoMetadata(opts);

  let videoPart: unknown;
  if (isYouTubeUrl(opts.input)) {
    videoPart = { fileData: { fileUri: opts.input }, ...(metadata ? { videoMetadata: metadata } : {}) };
  } else {
    if (!existsSync(opts.input)) throw new Error(`Video file not found: ${opts.input}`);
    const ext = path.extname(opts.input).toLowerCase();
    const mimeType = mimeByExt[ext];
    if (!mimeType) throw new Error(`Unsupported video extension: ${ext}`);

    let file = await ai.files.upload({
      file: opts.input,
      config: { mimeType },
    });

    while (!file.state || file.state.toString() !== "ACTIVE") {
      console.error(`Processing video... state=${file.state ?? "unknown"}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (!file.name) throw new Error("Gemini upload did not return a file name.");
      file = await ai.files.get({ name: file.name });
    }

    if (!file.uri) throw new Error("Gemini upload did not return a file URI.");
    videoPart = createPartFromUri(file.uri, file.mimeType ?? mimeType);
    if (metadata) (videoPart as Record<string, unknown>).videoMetadata = metadata;
  }

  const response = await ai.models.generateContent({
    model: opts.model,
    contents: createUserContent([videoPart as never, prompt]),
  });

  const text = textFromResponse(response);
  if (!text) throw new Error("Gemini returned no text.");

  if (opts.save) writeFileSync(opts.save, text);
  console.log(text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
