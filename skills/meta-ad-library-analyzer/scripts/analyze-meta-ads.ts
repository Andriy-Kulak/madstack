#!/usr/bin/env tsx
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";

type Limit = number | "all";
type AwarenessStage = "unaware" | "problem-aware" | "solution-aware" | "product-aware" | "most-aware" | "unclear";

type Env = Record<string, string>;

type ManifestAd = {
  ad_archive_id: string;
  title?: string | null;
  body_text?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  link_url?: string | null;
  link_description?: string | null;
  caption?: string | null;
  ad_library_url?: string | null;
  display_format?: string | null;
  video_file?: string | null;
  image_file?: string | null;
  preview_file?: string | null;
  source_video_url?: string | null;
  source_image_url?: string | null;
  source_preview_url?: string | null;
  errors?: string[];
  page_id?: string | null;
  page_name?: string | null;
  page_categories?: string[];
  page_like_count?: number | null;
  publisher_platform?: string[];
  start_date?: number | null;
  end_date?: number | null;
};

type Manifest = {
  generated_at?: string;
  source_file?: string;
  output_dir?: string;
  metadata?: Record<string, unknown>;
  counts?: Record<string, number>;
  ads: ManifestAd[];
};

type ScrapeAd = ManifestAd & {
  collation_id?: string | null;
  collation_count?: number | null;
};

type ScrapeResult = {
  ads?: ScrapeAd[];
};

type Options = {
  inputDir: string;
  outDir: string | null;
  limit: Limit | null;
  yes: boolean;
  force: boolean;
  concurrency: number;
  model: string;
  fps: number | null;
  mock: boolean;
};

type AdAnalysis = {
  ad_archive_id: string;
  media_type: "video" | "image" | "preview" | "metadata-only";
  local_media_file: string | null;
  title: string | null;
  body_text: string | null;
  cta_text: string | null;
  link_url: string | null;
  display_format: string | null;
  hook: string;
  primary_angle: string;
  angle_family: string;
  awareness_stage: AwarenessStage;
  audience_intent: string;
  problem: string;
  solution: string;
  claims: string[];
  proof_points: string[];
  objections_addressed: string[];
  visual_notes: string;
  audio_notes: string;
  cta_analysis: string;
  script_patterns: string[];
  reusable_hooks: string[];
  landing_destination: string;
  confidence_notes: string;
  observed_vs_inferred: string[];
  raw_model_text?: string;
  cached?: boolean;
};

type ReportJson = {
  generated_at: string;
  input_dir: string;
  counts: {
    ads: number;
    videos: number;
    images: number;
    previews: number;
    metadata_only: number;
  };
  business: {
    destination: string;
    product: string;
    audience: string;
    job_to_be_done: string;
  };
  problem_solution: {
    problem: string;
    solution: string;
    promise: string;
  };
  angle_clusters: Array<{
    name: string;
    count: number;
    ad_archive_ids: string[];
    summary: string;
    reusable_hook_patterns: string[];
  }>;
  awareness_distribution: Record<string, number>;
  creative_patterns: string[];
  script_generation_brief: {
    reusable_hooks: string[];
    claims_to_substantiate: string[];
    objections_to_address: string[];
    do_not_infer: string[];
  };
  recommendations: string[];
  ad_analyses: AdAnalysis[];
  raw_model_text?: string;
};

type ReportSynthesis = Omit<ReportJson, "generated_at" | "input_dir" | "counts" | "awareness_distribution" | "ad_analyses">;

const DEFAULT_MODEL = "gemini-3-flash-preview";
const LARGE_LIBRARY_THRESHOLD = 100;

const videoMimeByExt: Record<string, string> = {
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

const imageMimeByExt: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function usage(exitCode = 1): never {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  npm run meta-ads:analyze -- <archive-dir> [--out meta-files/brand-analysis] [--limit all|N] [--concurrency N] [--yes] [--force]
  npm run meta-ads:analyze:test
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Options | { command: "self-test" } {
  const [first, ...rest] = argv;
  if (!first || first === "--help" || first === "help") usage(first ? 0 : 1);
  if (first === "self-test") return { command: "self-test" };

  const opts: Options = {
    inputDir: first,
    outDir: null,
    limit: null,
    yes: false,
    force: false,
    concurrency: 2,
    model: DEFAULT_MODEL,
    fps: null,
    mock: false,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];
    switch (arg) {
      case "--out":
        if (!next) usage();
        opts.outDir = next;
        i += 1;
        break;
      case "--limit":
        opts.limit = parseLimit(next, "--limit");
        i += 1;
        break;
      case "--concurrency":
        opts.concurrency = parsePositiveInteger(next, "--concurrency");
        i += 1;
        break;
      case "--model":
        if (!next) usage();
        opts.model = next;
        i += 1;
        break;
      case "--fps":
        opts.fps = parsePositiveInteger(next, "--fps");
        i += 1;
        break;
      case "--yes":
        opts.yes = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--mock":
        opts.mock = true;
        break;
      default:
        throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return opts;
}

function parseLimit(raw: string | undefined, flag: string): Limit {
  if (!raw) throw new Error(`${flag} requires all or a positive integer.`);
  if (raw === "all") return "all";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`${flag} requires all or a positive integer.`);
  return parsed;
}

function parsePositiveInteger(raw: string | undefined, flag: string): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`${flag} requires a positive integer.`);
  return parsed;
}

function parseEnvFile(filePath: string): Env {
  if (!existsSync(filePath)) return {};
  const env: Env = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [rawKey, ...rest] = line.split("=");
    const key = rawKey.trim();
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadEnv(): Env {
  return {
    ...parseEnvFile(path.join(process.cwd(), ".env")),
    ...parseEnvFile(path.join(process.cwd(), ".env.local")),
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  };
}

function loadManifest(inputDir: string): Manifest {
  const manifestPath = path.join(inputDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing manifest.json in ${inputDir}. Run meta-ad-library-scraper archive-url first.`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (!Array.isArray(manifest.ads)) throw new Error(`Invalid manifest: ${manifestPath} does not contain ads[].`);
  return enrichManifestFromScrape(inputDir, manifest);
}

function enrichManifestFromScrape(inputDir: string, manifest: Manifest): Manifest {
  const scrapePath = path.join(inputDir, "ads.json");
  if (!existsSync(scrapePath)) return manifest;

  const scrape = JSON.parse(readFileSync(scrapePath, "utf8")) as ScrapeResult;
  const byId = new Map((scrape.ads ?? []).map((ad) => [ad.ad_archive_id, ad]));
  return {
    ...manifest,
    ads: manifest.ads.map((ad) => ({ ...byId.get(ad.ad_archive_id), ...ad })),
  };
}

function selectedAds(manifest: Manifest, opts: Options): ManifestAd[] {
  const ads = manifest.ads;
  if (ads.length > LARGE_LIBRARY_THRESHOLD && opts.limit === null && !opts.yes) {
    throw new Error(
      [
        `This archive has ${ads.length} ads. To avoid a large Gemini run by accident, choose how many to analyze.`,
        `Examples:`,
        `  npm run meta-ads:analyze -- ${opts.inputDir} --limit 100`,
        `  npm run meta-ads:analyze -- ${opts.inputDir} --limit all --yes`,
      ].join("\n"),
    );
  }
  const limit = opts.limit ?? "all";
  return limit === "all" ? ads : ads.slice(0, limit);
}

function defaultOutDir(inputDir: string): string {
  return path.join(inputDir, "analysis-report");
}

function absoluteMediaPath(inputDir: string, relativeFile: string | null | undefined): string | null {
  if (!relativeFile) return null;
  return path.isAbsolute(relativeFile) ? relativeFile : path.join(inputDir, relativeFile);
}

function chooseMedia(ad: ManifestAd, inputDir: string): { type: AdAnalysis["media_type"]; file: string | null; relativeFile: string | null } {
  const candidates: Array<{ type: AdAnalysis["media_type"]; relativeFile?: string | null }> = [
    { type: "video", relativeFile: ad.video_file },
    { type: "image", relativeFile: ad.image_file },
    { type: "preview", relativeFile: ad.preview_file },
  ];

  for (const candidate of candidates) {
    const file = absoluteMediaPath(inputDir, candidate.relativeFile);
    if (file && existsSync(file)) return { type: candidate.type, file, relativeFile: candidate.relativeFile ?? null };
  }

  return { type: "metadata-only", file: null, relativeFile: null };
}

function adPrompt(ad: ManifestAd, mediaType: AdAnalysis["media_type"]): string {
  return `Analyze this Meta ad as a paid-social creative strategist.

The final user of this analysis is another LLM that will create ad scripts and video hooks for a separate brand. Be concrete, source-grounded, and useful for script generation.

Return only valid JSON with these fields:
{
  "hook": "short observed hook or opening idea",
  "primary_angle": "succinct ad angle",
  "angle_family": "one angle family from the framework",
  "awareness_stage": "unaware | problem-aware | solution-aware | product-aware | most-aware | unclear",
  "audience_intent": "what the viewer likely wants",
  "problem": "problem this ad speaks to",
  "solution": "solution/promise this ad presents",
  "claims": ["observed claims only"],
  "proof_points": ["observed proof only"],
  "objections_addressed": ["objections the ad addresses"],
  "visual_notes": "visual style, scenes, pacing, demo, captions",
  "audio_notes": "speech/music/audio notes; say unclear/no speech if needed",
  "cta_analysis": "CTA and conversion path",
  "script_patterns": ["reusable structures for future ads"],
  "reusable_hooks": ["hook templates inspired by this ad, not copied"],
  "landing_destination": "destination inferred from metadata/url",
  "confidence_notes": "uncertainties and inferred details",
  "observed_vs_inferred": ["separate observed facts from inferences"]
}

Accuracy rules:
- Only report what is visible, audible, or present in metadata.
- Mark interpretation as (inferred).
- Do not invent exact performance, spend, targeting, or claims not present.
- Preserve source copy meaning.

Meta metadata:
- library_id: ${ad.ad_archive_id}
- media_type: ${mediaType}
- display_format: ${ad.display_format ?? "unknown"}
- page_name: ${ad.page_name ?? "unknown"}
- title: ${ad.title ?? ""}
- body_text: ${ad.body_text ?? ""}
- caption: ${ad.caption ?? ""}
- cta_text: ${ad.cta_text ?? ""}
- cta_type: ${ad.cta_type ?? ""}
- link_description: ${ad.link_description ?? ""}
- link_url: ${ad.link_url ?? ""}
- platforms: ${(ad.publisher_platform ?? []).join(", ") || "unknown"}
- start_date_unix: ${ad.start_date ?? ""}
- end_date_unix: ${ad.end_date ?? ""}`;
}

function synthesisPrompt(inputDir: string, analyses: AdAnalysis[]): string {
  const compact = analyses.map((ad) => ({
    ad_archive_id: ad.ad_archive_id,
    media_type: ad.media_type,
    title: ad.title,
    body_text: ad.body_text,
    cta_text: ad.cta_text,
    link_url: ad.link_url,
    hook: ad.hook,
    primary_angle: ad.primary_angle,
    angle_family: ad.angle_family,
    awareness_stage: ad.awareness_stage,
    problem: ad.problem,
    solution: ad.solution,
    claims: ad.claims,
    proof_points: ad.proof_points,
    objections_addressed: ad.objections_addressed,
    script_patterns: ad.script_patterns,
    reusable_hooks: ad.reusable_hooks,
    confidence_notes: ad.confidence_notes,
  }));

  return `Create a comprehensive Meta Ads Library creative strategy report from these per-ad analyses.

The report is source material for expert ad marketers and for another LLM that will generate hooks, UGC scripts, and video ad concepts for a different brand. Emphasize reusable strategy, not generic summaries.

Return only valid JSON with this shape:
{
  "business": {
    "destination": "where ads send users and what destination implies",
    "product": "business/product summary",
    "audience": "likely audience, with inferred labels where needed",
    "job_to_be_done": "core job the buyer hires the product for"
  },
  "problem_solution": {
    "problem": "core problem statement",
    "solution": "core solution statement",
    "promise": "transformation/promise"
  },
  "angle_clusters": [
    {
      "name": "cluster name",
      "count": 0,
      "ad_archive_ids": ["..."],
      "summary": "why these ads belong together",
      "reusable_hook_patterns": ["..."]
    }
  ],
  "creative_patterns": ["repeated visual/audio/copy/CTA patterns"],
  "script_generation_brief": {
    "reusable_hooks": ["new hook patterns grounded in the ads"],
    "claims_to_substantiate": ["claims a brand must prove before using"],
    "objections_to_address": ["common objections to script against"],
    "do_not_infer": ["things not proven by the ads"]
  },
  "recommendations": ["strategic recommendations and white-space opportunities"]
}

Input archive: ${inputDir}
Per-ad analyses:
${JSON.stringify(compact, null, 2)}`;
}

async function mediaPart(ai: GoogleGenAI, filePath: string, mediaType: AdAnalysis["media_type"], fps: number | null): Promise<unknown> {
  const ext = path.extname(filePath).toLowerCase();
  if (mediaType === "video") {
    const mimeType = videoMimeByExt[ext];
    if (!mimeType) throw new Error(`Unsupported video extension: ${ext}`);
    let file = await ai.files.upload({ file: filePath, config: { mimeType } });
    while (!file.state || file.state.toString() !== "ACTIVE") {
      process.stderr.write(`Processing video ${path.basename(filePath)}... state=${file.state ?? "unknown"}\n`);
      await sleep(5000);
      if (!file.name) throw new Error("Gemini upload did not return a file name.");
      file = await ai.files.get({ name: file.name });
    }
    if (!file.uri) throw new Error("Gemini upload did not return a file URI.");
    const part = createPartFromUri(file.uri, file.mimeType ?? mimeType) as Record<string, unknown>;
    if (fps) part.videoMetadata = { fps };
    return part;
  }

  const mimeType = imageMimeByExt[ext];
  if (!mimeType) throw new Error(`Unsupported image extension: ${ext}`);
  return {
    inlineData: {
      mimeType,
      data: readFileSync(filePath).toString("base64"),
    },
  };
}

function textFromResponse(response: unknown): string {
  const maybe = response as { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  if (typeof maybe.text === "string") return maybe.text;
  const parts = maybe.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  return parts.map((part) => part.text).filter(Boolean).join("\n").trim();
}

async function generateText(ai: GoogleGenAI, model: string, parts: unknown[]): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: createUserContent(parts as never[]),
    config: { responseMimeType: "application/json" },
  } as never);
  const text = textFromResponse(response);
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 4) break;
      const waitMs = Math.min(60000, 4000 * 2 ** attempt + Math.round(Math.random() * 1000));
      process.stderr.write(`${label} hit a rate limit; retrying in ${Math.round(waitMs / 1000)}s\n`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function isRateLimitError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const balanced = firstBalancedJsonObject(trimmed);
  if (balanced) return JSON.parse(balanced) as Record<string, unknown>;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    const fencedBalanced = firstBalancedJsonObject(fenced);
    if (fencedBalanced) return JSON.parse(fencedBalanced) as Record<string, unknown>;
  }
  throw new Error("Model response did not contain a JSON object.");
}

function firstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stringValue(value: unknown, fallback = "Unclear"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function awarenessStage(value: unknown): AwarenessStage {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const allowed: AwarenessStage[] = ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware", "unclear"];
  return allowed.includes(raw as AwarenessStage) ? (raw as AwarenessStage) : "unclear";
}

function normalizeAdAnalysis(raw: Record<string, unknown>, ad: ManifestAd, mediaType: AdAnalysis["media_type"], relativeFile: string | null, rawModelText?: string): AdAnalysis {
  return {
    ad_archive_id: ad.ad_archive_id,
    media_type: mediaType,
    local_media_file: relativeFile,
    title: ad.title ?? null,
    body_text: ad.body_text ?? null,
    cta_text: ad.cta_text ?? null,
    link_url: ad.link_url ?? null,
    display_format: ad.display_format ?? null,
    hook: stringValue(raw.hook),
    primary_angle: stringValue(raw.primary_angle),
    angle_family: stringValue(raw.angle_family),
    awareness_stage: awarenessStage(raw.awareness_stage),
    audience_intent: stringValue(raw.audience_intent),
    problem: stringValue(raw.problem),
    solution: stringValue(raw.solution),
    claims: stringArray(raw.claims),
    proof_points: stringArray(raw.proof_points),
    objections_addressed: stringArray(raw.objections_addressed),
    visual_notes: stringValue(raw.visual_notes),
    audio_notes: stringValue(raw.audio_notes),
    cta_analysis: stringValue(raw.cta_analysis),
    script_patterns: stringArray(raw.script_patterns),
    reusable_hooks: stringArray(raw.reusable_hooks),
    landing_destination: stringValue(raw.landing_destination, ad.link_url ?? "Unclear"),
    confidence_notes: stringValue(raw.confidence_notes),
    observed_vs_inferred: stringArray(raw.observed_vs_inferred),
    raw_model_text: rawModelText,
  };
}

function mockAdAnalysis(ad: ManifestAd, mediaType: AdAnalysis["media_type"], relativeFile: string | null): AdAnalysis {
  const body = ad.body_text ?? "";
  const problem = body ? `Problem surfaced in copy: ${body.slice(0, 140)}` : "Problem is unclear from metadata.";
  return {
    ad_archive_id: ad.ad_archive_id,
    media_type: mediaType,
    local_media_file: relativeFile,
    title: ad.title ?? null,
    body_text: ad.body_text ?? null,
    cta_text: ad.cta_text ?? null,
    link_url: ad.link_url ?? null,
    display_format: ad.display_format ?? null,
    hook: ad.title ?? (body.slice(0, 80) || "Mock hook"),
    primary_angle: "Mock product-benefit angle",
    angle_family: mediaType === "video" ? "feature demo" : "outcome transformation",
    awareness_stage: mediaType === "metadata-only" ? "unclear" : "solution-aware",
    audience_intent: "Find a clearer path to the promised outcome.",
    problem,
    solution: "The product is presented as the easier way to solve that problem.",
    claims: body ? [body] : [],
    proof_points: [],
    objections_addressed: [],
    visual_notes: `Mock analysis for ${mediaType}.`,
    audio_notes: mediaType === "video" ? "Mock video audio analysis." : "No video audio.",
    cta_analysis: ad.cta_text ?? "CTA unclear.",
    script_patterns: ["Open with the pain, show the product mechanism, close with a direct CTA."],
    reusable_hooks: ["Still dealing with [pain]? Try [product mechanism]."],
    landing_destination: ad.link_url ?? "Unclear",
    confidence_notes: "Mock analysis used for fixture testing only.",
    observed_vs_inferred: ["Mock output; no media model call was made."],
  };
}

async function analyzeOneAd(ai: GoogleGenAI | null, opts: Options, inputDir: string, ad: ManifestAd, outDir: string): Promise<AdAnalysis> {
  const cacheDir = path.join(outDir, "analysis", "ads");
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${ad.ad_archive_id}.json`);
  if (!opts.force && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as AdAnalysis;
    return { ...cached, cached: true };
  }

  const chosen = chooseMedia(ad, inputDir);
  let analysis: AdAnalysis;
  if (opts.mock) {
    analysis = mockAdAnalysis(ad, chosen.type, chosen.relativeFile);
  } else {
    if (!ai) throw new Error("Gemini client is not configured.");
    const prompt = adPrompt(ad, chosen.type);
    const parts: unknown[] = [];
    if (chosen.file && chosen.type !== "metadata-only") parts.push(await mediaPart(ai, chosen.file, chosen.type, opts.fps));
    parts.push(prompt);
    const rawText = await withRetries(`ad ${ad.ad_archive_id}`, () => generateText(ai, opts.model, parts));
    analysis = normalizeAdAnalysis(extractJsonObject(rawText), ad, chosen.type, chosen.relativeFile, rawText);
  }

  writeFileSync(cachePath, `${JSON.stringify(analysis, null, 2)}\n`);
  return analysis;
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

function awarenessDistribution(analyses: AdAnalysis[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const ad of analyses) distribution[ad.awareness_stage] = (distribution[ad.awareness_stage] ?? 0) + 1;
  return distribution;
}

function fallbackReport(inputDir: string, analyses: AdAnalysis[]): ReportSynthesis {
  const clusterMap = new Map<string, AdAnalysis[]>();
  for (const ad of analyses) {
    const key = ad.angle_family || ad.primary_angle || "Unclear";
    clusterMap.set(key, [...(clusterMap.get(key) ?? []), ad]);
  }

  return {
    business: {
      destination: mostCommon(analyses.map((ad) => ad.link_url).filter(Boolean) as string[]) ?? "Unclear",
      product: "Inferred from ad copy and landing destinations.",
      audience: "Inferred from repeated problems and promises in the ads.",
      job_to_be_done: "Move the viewer from a painful current state to the advertised product outcome.",
    },
    problem_solution: {
      problem: mostCommon(analyses.map((ad) => ad.problem)) ?? "Unclear",
      solution: mostCommon(analyses.map((ad) => ad.solution)) ?? "Unclear",
      promise: "The product offers a simpler path to the outcome emphasized across the ads.",
    },
    angle_clusters: Array.from(clusterMap.entries()).map(([name, ads]) => ({
      name,
      count: ads.length,
      ad_archive_ids: ads.map((ad) => ad.ad_archive_id),
      summary: `${ads.length} ads use this angle family.`,
      reusable_hook_patterns: ads.flatMap((ad) => ad.reusable_hooks).slice(0, 6),
    })),
    creative_patterns: [...new Set(analyses.map((ad) => ad.visual_notes).filter(Boolean))].slice(0, 12),
    script_generation_brief: {
      reusable_hooks: [...new Set(analyses.flatMap((ad) => ad.reusable_hooks))].slice(0, 20),
      claims_to_substantiate: [...new Set(analyses.flatMap((ad) => ad.claims))].slice(0, 20),
      objections_to_address: [...new Set(analyses.flatMap((ad) => ad.objections_addressed))].slice(0, 20),
      do_not_infer: ["Do not infer spend, performance, targeting, or conversion data from this public archive."],
    },
    recommendations: [`Review ${path.basename(inputDir)} angle clusters and adapt only substantiated claims.`],
  };
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => item.trim()).filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function synthesizeReport(ai: GoogleGenAI | null, opts: Options, inputDir: string, analyses: AdAnalysis[]): Promise<ReportSynthesis> {
  if (opts.mock) return fallbackReport(inputDir, analyses);
  if (!ai) throw new Error("Gemini client is not configured.");
  const rawText = await withRetries("final synthesis", () => generateText(ai, opts.model, [synthesisPrompt(inputDir, analyses)]));
  const raw = extractJsonObject(rawText);
  const fallback = fallbackReport(inputDir, analyses);
  return {
    business: {
      destination: stringValue((raw.business as Record<string, unknown> | undefined)?.destination, fallback.business.destination),
      product: stringValue((raw.business as Record<string, unknown> | undefined)?.product, fallback.business.product),
      audience: stringValue((raw.business as Record<string, unknown> | undefined)?.audience, fallback.business.audience),
      job_to_be_done: stringValue((raw.business as Record<string, unknown> | undefined)?.job_to_be_done, fallback.business.job_to_be_done),
    },
    problem_solution: {
      problem: stringValue((raw.problem_solution as Record<string, unknown> | undefined)?.problem, fallback.problem_solution.problem),
      solution: stringValue((raw.problem_solution as Record<string, unknown> | undefined)?.solution, fallback.problem_solution.solution),
      promise: stringValue((raw.problem_solution as Record<string, unknown> | undefined)?.promise, fallback.problem_solution.promise),
    },
    angle_clusters: Array.isArray(raw.angle_clusters) ? raw.angle_clusters.map(normalizeCluster).filter(Boolean) as ReportJson["angle_clusters"] : fallback.angle_clusters,
    creative_patterns: stringArray(raw.creative_patterns).length ? stringArray(raw.creative_patterns) : fallback.creative_patterns,
    script_generation_brief: {
      reusable_hooks: stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.reusable_hooks).length
        ? stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.reusable_hooks)
        : fallback.script_generation_brief.reusable_hooks,
      claims_to_substantiate: stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.claims_to_substantiate).length
        ? stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.claims_to_substantiate)
        : fallback.script_generation_brief.claims_to_substantiate,
      objections_to_address: stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.objections_to_address).length
        ? stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.objections_to_address)
        : fallback.script_generation_brief.objections_to_address,
      do_not_infer: stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.do_not_infer).length
        ? stringArray((raw.script_generation_brief as Record<string, unknown> | undefined)?.do_not_infer)
        : fallback.script_generation_brief.do_not_infer,
    },
    recommendations: stringArray(raw.recommendations).length ? stringArray(raw.recommendations) : fallback.recommendations,
    raw_model_text: rawText,
  };
}

function normalizeCluster(value: unknown): ReportJson["angle_clusters"][number] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    name: stringValue(raw.name),
    count: typeof raw.count === "number" ? raw.count : stringArray(raw.ad_archive_ids).length,
    ad_archive_ids: stringArray(raw.ad_archive_ids),
    summary: stringValue(raw.summary),
    reusable_hook_patterns: stringArray(raw.reusable_hook_patterns),
  };
}

function buildReportJson(inputDir: string, analyses: AdAnalysis[], synthesis: ReportSynthesis): ReportJson {
  const angleClusters = finalizeClusters(synthesis.angle_clusters, analyses);
  return {
    generated_at: new Date().toISOString(),
    input_dir: path.resolve(inputDir),
    counts: {
      ads: analyses.length,
      videos: analyses.filter((ad) => ad.media_type === "video").length,
      images: analyses.filter((ad) => ad.media_type === "image").length,
      previews: analyses.filter((ad) => ad.media_type === "preview").length,
      metadata_only: analyses.filter((ad) => ad.media_type === "metadata-only").length,
    },
    business: synthesis.business,
    problem_solution: synthesis.problem_solution,
    angle_clusters: angleClusters,
    awareness_distribution: awarenessDistribution(analyses),
    creative_patterns: synthesis.creative_patterns,
    script_generation_brief: synthesis.script_generation_brief,
    recommendations: synthesis.recommendations,
    ad_analyses: analyses,
    raw_model_text: synthesis.raw_model_text,
  };
}

function finalizeClusters(clusters: ReportJson["angle_clusters"], analyses: AdAnalysis[]): ReportJson["angle_clusters"] {
  const allIds = new Set(analyses.map((ad) => ad.ad_archive_id));
  const seenIds = new Set<string>();
  const normalized = clusters.map((cluster) => {
    const adArchiveIds = [...new Set(cluster.ad_archive_ids)].filter((id) => allIds.has(id));
    for (const id of adArchiveIds) seenIds.add(id);
    return {
      ...cluster,
      ad_archive_ids: adArchiveIds,
      count: adArchiveIds.length || cluster.count,
    };
  });

  const unclustered = analyses.filter((ad) => !seenIds.has(ad.ad_archive_id));
  if (unclustered.length > 0) {
    normalized.push({
      name: "Other / Long-Tail Tested Angles",
      count: unclustered.length,
      ad_archive_ids: unclustered.map((ad) => ad.ad_archive_id),
      summary: "Ads that were analyzed individually but were not assigned to one of the model's major repeated angle clusters.",
      reusable_hook_patterns: [...new Set(unclustered.flatMap((ad) => ad.reusable_hooks))].slice(0, 8),
    });
  }

  return normalized;
}

function renderMarkdown(report: ReportJson): string {
  return `# Meta Ads Library Creative Report

Generated: ${report.generated_at}

Input archive: ${report.input_dir}

## Executive Summary

- Ads analyzed: ${report.counts.ads} (${report.counts.videos} videos, ${report.counts.images} images, ${report.counts.previews} previews, ${report.counts.metadata_only} metadata-only)
- Destination: ${report.business.destination}
- Product: ${report.business.product}
- Audience: ${report.business.audience}
- Core job: ${report.business.job_to_be_done}

## Problem-Solution

- Problem: ${report.problem_solution.problem}
- Solution: ${report.problem_solution.solution}
- Promise: ${report.problem_solution.promise}

## Awareness Stages

${Object.entries(report.awareness_distribution).map(([stage, count]) => `- ${stage}: ${count}`).join("\n") || "- None"}

## Angle Clusters

${report.angle_clusters.map((cluster) => `### ${cluster.name}

- Count: ${cluster.count}
- Ads: ${cluster.ad_archive_ids.join(", ") || "Unclear"}
- Summary: ${cluster.summary}
- Reusable hook patterns:
${cluster.reusable_hook_patterns.map((hook) => `  - ${hook}`).join("\n") || "  - None captured"}`).join("\n\n")}

## Creative Patterns

${report.creative_patterns.map((pattern) => `- ${pattern}`).join("\n") || "- None captured"}

## Script-Generation Brief

### Reusable Hooks

${report.script_generation_brief.reusable_hooks.map((hook) => `- ${hook}`).join("\n") || "- None captured"}

### Claims To Substantiate

${report.script_generation_brief.claims_to_substantiate.map((claim) => `- ${claim}`).join("\n") || "- None captured"}

### Objections To Address

${report.script_generation_brief.objections_to_address.map((objection) => `- ${objection}`).join("\n") || "- None captured"}

### Do Not Infer

${report.script_generation_brief.do_not_infer.map((item) => `- ${item}`).join("\n") || "- Do not infer spend, targeting, or performance from public Meta data."}

## Recommendations

${report.recommendations.map((recommendation) => `- ${recommendation}`).join("\n") || "- None captured"}

## Per-Ad Detail

${report.ad_analyses.map(renderAdMarkdown).join("\n\n")}
`;
}

function renderAdMarkdown(ad: AdAnalysis): string {
  return `### Library ID ${ad.ad_archive_id}

- Media: ${ad.media_type}${ad.local_media_file ? ` (${ad.local_media_file})` : ""}
- Title: ${ad.title ?? "Untitled"}
- Body: ${ad.body_text ?? ""}
- CTA: ${ad.cta_text ?? "Unclear"}
- Link: ${ad.link_url ?? "Unclear"}
- Hook: ${ad.hook}
- Angle: ${ad.primary_angle} (${ad.angle_family})
- Awareness: ${ad.awareness_stage}
- Problem: ${ad.problem}
- Solution: ${ad.solution}
- Visuals: ${ad.visual_notes}
- Audio: ${ad.audio_notes}
- Script patterns: ${ad.script_patterns.join("; ") || "None captured"}
- Reusable hooks: ${ad.reusable_hooks.join("; ") || "None captured"}
- Confidence: ${ad.confidence_notes}`;
}

function renderHtml(report: ReportJson, outDir: string): string {
  const cards = report.ad_analyses.map((ad) => {
    const mediaPath = ad.local_media_file ? path.relative(outDir, path.join(report.input_dir, ad.local_media_file)).replaceAll(path.sep, "/") : null;
    const media = mediaPath && ad.media_type === "video"
      ? `<video src="${safeText(mediaPath)}" controls preload="metadata"></video>`
      : mediaPath && (ad.media_type === "image" || ad.media_type === "preview")
        ? `<img src="${safeText(mediaPath)}" alt="">`
        : `<div class="missing">No local media</div>`;
    return `<article class="ad">
  <div class="media">${media}</div>
  <div class="copy">
    <div class="meta"><span>${safeText(ad.media_type)}</span><span>Library ID ${safeText(ad.ad_archive_id)}</span><span>${safeText(ad.awareness_stage)}</span></div>
    <h2>${safeText(ad.title ?? "Untitled ad")}</h2>
    <p class="body">${safeText(ad.body_text ?? "")}</p>
    <h3>${safeText(ad.primary_angle)}</h3>
    <p>${safeText(ad.hook)}</p>
    <p><strong>Problem:</strong> ${safeText(ad.problem)}</p>
    <p><strong>Solution:</strong> ${safeText(ad.solution)}</p>
    <p><strong>Reusable hooks:</strong> ${safeText(ad.reusable_hooks.join("; "))}</p>
    <p class="links">${safeText(ad.cta_text ?? "")} ${ad.link_url ? `- <a href="${safeText(ad.link_url)}">${safeText(ad.link_url)}</a>` : ""}</p>
  </div>
</article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meta Ads Creative Report</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f8fb;color:#17202a}
header{background:#fff;border-bottom:1px solid #dde3ed;padding:18px 24px;position:sticky;top:0;z-index:2}
h1{font-size:22px;margin:0 0 6px}.summary{color:#526071;font-size:14px}.wrap{max-width:1440px;margin:auto;padding:18px;display:grid;gap:16px}
.section{background:#fff;border:1px solid #dfe5ee;border-radius:8px;padding:16px}
.ad{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:18px;background:#fff;border:1px solid #dfe5ee;border-radius:8px;padding:14px}
video,img{width:100%;max-height:540px;background:#111;border-radius:6px;object-fit:contain}.missing{display:grid;place-items:center;min-height:220px;background:#edf1f7;border-radius:6px;color:#667085}
.meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:.02em}
h2{font-size:18px;margin:10px 0 8px}h3{font-size:15px;margin:14px 0 4px}.body{white-space:pre-wrap;line-height:1.45}.links{font-size:13px;color:#526071;word-break:break-word}
@media(max-width:820px){.ad{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <h1>Meta Ads Creative Report</h1>
  <div class="summary">${report.counts.ads} ads - ${report.counts.videos} videos - ${report.counts.images} images - generated ${safeText(report.generated_at)}</div>
</header>
<main class="wrap">
  <section class="section">
    <h2>Business + Problem-Solution</h2>
    <p><strong>Destination:</strong> ${safeText(report.business.destination)}</p>
    <p><strong>Product:</strong> ${safeText(report.business.product)}</p>
    <p><strong>Problem:</strong> ${safeText(report.problem_solution.problem)}</p>
    <p><strong>Solution:</strong> ${safeText(report.problem_solution.solution)}</p>
  </section>
  <section class="section">
    <h2>Angle Clusters</h2>
    ${report.angle_clusters.map((cluster) => `<p><strong>${safeText(cluster.name)}</strong> (${cluster.count}): ${safeText(cluster.summary)}</p>`).join("\n")}
  </section>
${cards}
</main>
</body>
</html>`;
}

function safeText(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function analyzeArchive(opts: Options) {
  const inputDir = path.resolve(opts.inputDir);
  const manifest = loadManifest(inputDir);
  const ads = selectedAds(manifest, { ...opts, inputDir });
  const outDir = path.resolve(opts.outDir ?? defaultOutDir(inputDir));
  mkdirSync(outDir, { recursive: true });

  let ai: GoogleGenAI | null = null;
  if (!opts.mock) {
    const env = loadEnv();
    const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY. Configure it locally; do not paste keys into chat or repo files.");
    ai = new GoogleGenAI({ apiKey });
  }

  process.stderr.write(`Analyzing ${ads.length}/${manifest.ads.length} ads with concurrency ${opts.concurrency}\n`);
  const analyses = await runWithConcurrency(ads, opts.concurrency, async (ad, index) => {
    const analysis = await analyzeOneAd(ai, opts, inputDir, ad, outDir);
    process.stderr.write(`Analyzed ${index + 1}/${ads.length}: ${ad.ad_archive_id}${analysis.cached ? " (cached)" : ""}\n`);
    return analysis;
  });

  const synthesis = await synthesizeReport(ai, opts, inputDir, analyses);
  const report = buildReportJson(inputDir, analyses, synthesis);

  writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outDir, "report.md"), renderMarkdown(report));
  writeFileSync(path.join(outDir, "index.html"), renderHtml(report, outDir));

  process.stdout.write(`${JSON.stringify({
    output_dir: outDir,
    report: path.join(outDir, "report.md"),
    json: path.join(outDir, "report.json"),
    gallery: path.join(outDir, "index.html"),
    counts: report.counts,
  }, null, 2)}\n`);
}

async function runSelfTest() {
  const root = mkdtempSync(path.join(os.tmpdir(), "meta-ad-analyzer-"));
  try {
    const archive = path.join(root, "archive");
    mkdirSync(path.join(archive, "videos"), { recursive: true });
    mkdirSync(path.join(archive, "images"), { recursive: true });
    writeFileSync(path.join(archive, "videos", "001.mp4"), "mock video");
    writeFileSync(path.join(archive, "images", "002.jpg"), "mock image");
    const manifest: Manifest = {
      generated_at: "2026-05-21T00:00:00.000Z",
      counts: { ads: 3, videos: 1, images: 1, previews: 0, errored_ads: 0 },
      ads: [
        {
          ad_archive_id: "1",
          title: "Sleep better tonight",
          body_text: "Stop guessing baby's nap schedule.",
          cta_text: "Install now",
          link_url: "https://apps.apple.com/app/example",
          display_format: "VIDEO",
          video_file: "videos/001.mp4",
          page_name: "Example Baby App",
          publisher_platform: ["facebook", "instagram"],
          start_date: 1779321600,
        },
        {
          ad_archive_id: "2",
          title: "Nap predictions",
          body_text: "Daily recommendations for baby sleep.",
          cta_text: "Learn more",
          link_url: "https://example.com",
          display_format: "IMAGE",
          image_file: "images/002.jpg",
        },
        {
          ad_archive_id: "3",
          title: "Missing media",
          body_text: "A metadata-only ad.",
          display_format: "TEXT",
        },
      ],
    };
    writeFileSync(path.join(archive, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const outDir = path.join(root, "out");
    await analyzeArchive({
      inputDir: archive,
      outDir,
      limit: "all",
      yes: false,
      force: false,
      concurrency: 2,
      model: DEFAULT_MODEL,
      fps: null,
      mock: true,
    });
    await analyzeArchive({
      inputDir: archive,
      outDir,
      limit: 2,
      yes: false,
      force: false,
      concurrency: 2,
      model: DEFAULT_MODEL,
      fps: null,
      mock: true,
    });

    const report = JSON.parse(readFileSync(path.join(outDir, "report.json"), "utf8")) as ReportJson;
    assert(existsSync(path.join(outDir, "report.md")), "report.md should be written");
    assert(existsSync(path.join(outDir, "index.html")), "index.html should be written");
    assert(report.counts.ads === 2, "second cached run should respect --limit 2");
    assert(report.ad_analyses.some((ad) => ad.media_type === "video"), "video ad should be analyzed");
    assert(report.ad_analyses.some((ad) => ad.media_type === "image"), "image ad should be analyzed");
    assert(report.ad_analyses.every((ad) => ad.reusable_hooks.length > 0), "analysis should include reusable hooks");

    const bigManifest: Manifest = { ads: Array.from({ length: 101 }, (_, index) => ({ ad_archive_id: String(index + 1) })) };
    assertThrows(() => selectedAds(bigManifest, {
      inputDir: archive,
      outDir,
      limit: null,
      yes: false,
      force: false,
      concurrency: 2,
      model: DEFAULT_MODEL,
      fps: null,
      mock: true,
    }), "large-library guard should fire");

    process.stdout.write("meta-ad-library-analyzer self-test passed.\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, message: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if ("command" in opts) {
    await runSelfTest();
  } else {
    await analyzeArchive(opts);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
