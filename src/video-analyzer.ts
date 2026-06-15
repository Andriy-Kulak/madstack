import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";

export type VideoAnalysisMode = "general" | "ad";

export interface AnalyzeVideoOptions {
  input: string;
  mode?: VideoAnalysisMode;
  prompt?: string;
  model?: string;
  fps?: number;
  start?: string;
  end?: string;
  save?: string;
  keepUploadedFile?: boolean;
  apiKey?: string;
  env?: Env;
  onProgress?: (message: string) => void;
}

export interface AnalyzeVideoResult {
  text: string;
  model: string;
  mode: VideoAnalysisMode;
  inputType: "youtube" | "file";
  uploadedFileName?: string;
  uploadedFileUri?: string;
  deletedUploadedFile?: boolean;
}

export type Env = Record<string, string | undefined>;

export const DEFAULT_VIDEO_MODEL = "gemini-3-flash-preview";

export const mimeByExt: Record<string, string> = {
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

const accuracyRules = `CRITICAL ACCURACY RULES:
- Only report what is actually visible or audible in the video.
- Do not invent narrators, voiceovers, speaker names, creator names, brands, claims, offers, or transcript lines.
- If no speech is audible, say "No speech detected." If the audio is silent or ambient only, say that plainly.
- Distinguish observed facts from interpretation. Label lower-confidence interpretation as "(inferred)".
- Quote on-screen text and spoken lines only when readable or audible. If text/audio is unclear, say "unclear" rather than guessing.
- Prioritize accuracy over completeness.`;

export function parseEnvFile(filePath: string): Env {
  if (!existsSync(filePath)) return {};

  const env: Env = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const [rawKey, ...rest] = line.split("=");
    const key = rawKey.trim();
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

export function loadEnv(root = process.cwd()): Env {
  return {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };
}

function cleanApiKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key || key === "REPLACE_ME_WITH_YOUR_GEMINI_API_KEY" || key === "your-api-key-here") return undefined;
  return key;
}

export function resolveGeminiApiKey(env: Env = process.env): string | undefined {
  return cleanApiKey(env.GEMINI_API_KEY) || cleanApiKey(env.GOOGLE_API_KEY);
}

export function isYouTubeUrl(input: string): boolean {
  return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(input);
}

export function supportedVideoExtensions(): string[] {
  return Object.keys(mimeByExt).sort();
}

export function getVideoMimeType(input: string): string {
  const ext = path.extname(input).toLowerCase();
  const mimeType = mimeByExt[ext];
  if (!mimeType) {
    throw new Error(`Unsupported video extension: ${ext || "(none)"}. Supported: ${supportedVideoExtensions().join(", ")}`);
  }
  return mimeType;
}

export function validateVideoInput(input: string): "youtube" | "file" {
  if (isYouTubeUrl(input)) return "youtube";
  if (!existsSync(input)) throw new Error(`Video file not found: ${input}`);
  getVideoMimeType(input);
  return "file";
}

export function basePrompt(mode: VideoAnalysisMode): string {
  if (mode === "ad") {
    return `Analyze this video as a paid-social ad creative strategist.

${accuracyRules}

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

Separate observed facts from marketing interpretation. If speech, text, or details are unclear, say unclear rather than guessing.`;
  }

  return `Analyze this video neutrally.

${accuracyRules}

Return:
1. Concise Summary
2. Timeline / Scene-by-Scene Breakdown
3. Audio Report / Transcript
4. On-Screen Text
5. Key Visual Details
6. Key Moments
7. Unclear or Uncertain Parts`;
}

export function buildPrompt(mode: VideoAnalysisMode, prompt?: string): string {
  return [basePrompt(mode), prompt].filter(Boolean).join("\n\nAdditional user instruction:\n");
}

function videoMetadata(opts: AnalyzeVideoOptions): Record<string, unknown> | undefined {
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

async function waitForActiveFile(
  ai: GoogleGenAI,
  file: Awaited<ReturnType<GoogleGenAI["files"]["upload"]>>,
  onProgress?: (message: string) => void,
) {
  while (!file.state || file.state.toString() !== "ACTIVE") {
    onProgress?.(`Processing video... state=${file.state ?? "unknown"}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (!file.name) throw new Error("Gemini upload did not return a file name.");
    file = await ai.files.get({ name: file.name });
  }
  return file;
}

export async function analyzeVideo(opts: AnalyzeVideoOptions): Promise<AnalyzeVideoResult> {
  const mode = opts.mode ?? "general";
  const model = opts.model ?? DEFAULT_VIDEO_MODEL;
  const apiKey = opts.apiKey?.trim() || resolveGeminiApiKey(opts.env);
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY. Configure it in the MCP server env or local CLI environment; do not paste keys into chat or repo files.");
  }

  const inputType = validateVideoInput(opts.input);
  const prompt = buildPrompt(mode, opts.prompt);
  const ai = new GoogleGenAI({ apiKey });
  const metadata = videoMetadata(opts);
  let uploadedFileName: string | undefined;
  let uploadedFileUri: string | undefined;
  let deletedUploadedFile = false;

  let videoPart: Record<string, unknown>;
  if (inputType === "youtube") {
    videoPart = { fileData: { fileUri: opts.input }, ...(metadata ? { videoMetadata: metadata } : {}) };
  } else {
    const mimeType = getVideoMimeType(opts.input);
    let file = await ai.files.upload({
      file: opts.input,
      config: { mimeType },
    });

    file = await waitForActiveFile(ai, file, opts.onProgress);

    if (!file.uri) throw new Error("Gemini upload did not return a file URI.");
    uploadedFileName = file.name;
    uploadedFileUri = file.uri;
    videoPart = createPartFromUri(file.uri, file.mimeType ?? mimeType) as Record<string, unknown>;
    if (metadata) videoPart.videoMetadata = metadata;
  }

  let text = "";
  try {
    const response = await ai.models.generateContent({
      model,
      contents: createUserContent([videoPart as never, prompt]),
    });

    text = textFromResponse(response);
    if (!text) throw new Error("Gemini returned no text.");

    if (opts.save) writeFileSync(opts.save, text);
  } finally {
    if (uploadedFileName && !opts.keepUploadedFile) {
      try {
        await ai.files.delete({ name: uploadedFileName });
        deletedUploadedFile = true;
      } catch (error) {
        opts.onProgress?.(`Warning: could not delete uploaded Gemini file ${uploadedFileName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    text,
    model,
    mode,
    inputType,
    uploadedFileName,
    uploadedFileUri,
    deletedUploadedFile,
  };
}
