#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string>;
type Command = "daily" | "self-test" | "help";

type Flags = Record<string, string | boolean>;

type RadarOptions = {
  seedHandles: string[];
  days: number;
  minLikes: number;
  aboveAverageMultiple: number;
  limit: number;
  topics: string[];
  includeMedia: boolean;
  json: boolean;
  out?: string;
  model: string;
  fromDate: string;
  toDate: string;
};

type RadarReport = {
  generated_at: string;
  window: {
    from_date: string;
    to_date: string;
    lookback_days: number;
  };
  parameters: {
    seed_handles: string[];
    topics: string[];
    min_likes: number;
    above_average_multiple: number;
    limit: number;
    include_media: boolean;
  };
  executive_summary: string;
  posts: Array<{
    rank: number;
    author_handle: string;
    author_name: string;
    post_url: string;
    posted_at: string;
    text_summary: string;
    exact_text_excerpt: string;
    like_count: number | null;
    repost_count: number | null;
    reply_count: number | null;
    view_count: number | null;
    above_average_signal: string;
    why_interesting: string;
    growth_marketing_relevance: string;
    ai_ads_relevance: string;
    emerging_voice_signal: string;
    tags: string[];
    score: {
      total: number;
      attention: number;
      novelty: number;
      tactical_utility: number;
      ai_ads_relevance: number;
      emerging_voice: number;
    };
    confidence: "high" | "medium" | "low";
  }>;
  emerging_voices: Array<{
    handle: string;
    name: string;
    profile_url: string;
    why_follow: string;
    evidence_url: string;
    confidence: "high" | "medium" | "low";
  }>;
  tools_and_trends: Array<{
    name: string;
    category: string;
    why_it_matters: string;
    evidence_url: string;
    confidence: "high" | "medium" | "low";
  }>;
  parameter_notes: {
    what_worked: string;
    what_to_change_next: string;
    suggested_next_parameters: {
      days: number;
      min_likes: number;
      above_average_multiple: number;
      seed_handles: string[];
      topics: string[];
    };
  };
  citations: string[];
};

const defaultTopics = [
  "growth marketing",
  "AI ads",
  "paid social creative",
  "UGC automation",
  "AI landing pages",
  "ad generation",
  "creative testing",
  "conversion rate optimization",
  "attribution",
  "growth tech",
];

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "generated_at",
    "window",
    "parameters",
    "executive_summary",
    "posts",
    "emerging_voices",
    "tools_and_trends",
    "parameter_notes",
  ],
  properties: {
    generated_at: { type: "string" },
    window: {
      type: "object",
      additionalProperties: false,
      required: ["from_date", "to_date", "lookback_days"],
      properties: {
        from_date: { type: "string" },
        to_date: { type: "string" },
        lookback_days: { type: "integer" },
      },
    },
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["seed_handles", "topics", "min_likes", "above_average_multiple", "limit", "include_media"],
      properties: {
        seed_handles: { type: "array", items: { type: "string" } },
        topics: { type: "array", items: { type: "string" } },
        min_likes: { type: "integer" },
        above_average_multiple: { type: "number" },
        limit: { type: "integer" },
        include_media: { type: "boolean" },
      },
    },
    executive_summary: { type: "string" },
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rank",
          "author_handle",
          "author_name",
          "post_url",
          "posted_at",
          "text_summary",
          "exact_text_excerpt",
          "like_count",
          "repost_count",
          "reply_count",
          "view_count",
          "above_average_signal",
          "why_interesting",
          "growth_marketing_relevance",
          "ai_ads_relevance",
          "emerging_voice_signal",
          "tags",
          "score",
          "confidence",
        ],
        properties: {
          rank: { type: "integer" },
          author_handle: { type: "string" },
          author_name: { type: "string" },
          post_url: { type: "string" },
          posted_at: { type: "string" },
          text_summary: { type: "string" },
          exact_text_excerpt: { type: "string" },
          like_count: { type: ["integer", "null"] },
          repost_count: { type: ["integer", "null"] },
          reply_count: { type: ["integer", "null"] },
          view_count: { type: ["integer", "null"] },
          above_average_signal: { type: "string" },
          why_interesting: { type: "string" },
          growth_marketing_relevance: { type: "string" },
          ai_ads_relevance: { type: "string" },
          emerging_voice_signal: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          score: {
            type: "object",
            additionalProperties: false,
            required: ["total", "attention", "novelty", "tactical_utility", "ai_ads_relevance", "emerging_voice"],
            properties: {
              total: { type: "integer" },
              attention: { type: "integer" },
              novelty: { type: "integer" },
              tactical_utility: { type: "integer" },
              ai_ads_relevance: { type: "integer" },
              emerging_voice: { type: "integer" },
            },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    emerging_voices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["handle", "name", "profile_url", "why_follow", "evidence_url", "confidence"],
        properties: {
          handle: { type: "string" },
          name: { type: "string" },
          profile_url: { type: "string" },
          why_follow: { type: "string" },
          evidence_url: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    tools_and_trends: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "why_it_matters", "evidence_url", "confidence"],
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          why_it_matters: { type: "string" },
          evidence_url: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    parameter_notes: {
      type: "object",
      additionalProperties: false,
      required: ["what_worked", "what_to_change_next", "suggested_next_parameters"],
      properties: {
        what_worked: { type: "string" },
        what_to_change_next: { type: "string" },
        suggested_next_parameters: {
          type: "object",
          additionalProperties: false,
          required: ["days", "min_likes", "above_average_multiple", "seed_handles", "topics"],
          properties: {
            days: { type: "integer" },
            min_likes: { type: "integer" },
            above_average_multiple: { type: "number" },
            seed_handles: { type: "array", items: { type: "string" } },
            topics: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;

function parseEnvFile(filePath: string): Env {
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

function loadEnv(): Env {
  const localEnv = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const envFile = parseEnvFile(path.join(process.cwd(), ".env"));
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  return { ...envFile, ...localEnv, ...processEnv };
}

function getRequired(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function parseArgs(argv: string[]) {
  const command = (argv[0] ?? "help") as Command;
  const flags: Flags = {};

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }

  return { command, flags };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run x-growth-radar -- daily [--seed rileybrown] [--days 7] [--min-likes 50] [--json]",
    "  npm run x-growth-radar -- daily --seed rileybrown,handle2 --topics \"AI ads,UGC automation\" --out outputs/x-growth-radar",
    "  npm run x-growth-radar:test",
    "",
    "Required env:",
    "  XAI_API_KEY",
  ].join("\n");
}

function splitCsv(value: string | boolean | undefined, fallback: string[]): string[] {
  if (typeof value !== "string") return fallback;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseNumberFlag(flags: Flags, key: string, fallback: number, min: number): number {
  const raw = flags[key];
  if (raw === undefined || typeof raw === "boolean") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) throw new Error(`--${key} must be a number >= ${min}.`);
  return value;
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^https?:\/\/(www\.)?x\.com\//i, "").replace(/^@+/, "").replace(/\/.*$/, "");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildOptions(flags: Flags): RadarOptions {
  const days = Math.round(parseNumberFlag(flags, "days", 7, 1));
  const today = typeof flags.to === "string" ? flags.to : isoDate(new Date());
  const fromDate =
    typeof flags.from === "string"
      ? flags.from
      : isoDate(new Date(new Date(`${today}T00:00:00.000Z`).getTime() - (days - 1) * 24 * 60 * 60 * 1000));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error("--from and --to must use YYYY-MM-DD.");
  }

  const seedHandles = splitCsv(flags.seed ?? flags.handles, ["rileybrown"]).map(normalizeHandle).filter(Boolean);
  if (seedHandles.length > 20) throw new Error("xAI x_search accepts at most 20 allowed X handles.");

  return {
    seedHandles,
    days,
    minLikes: Math.round(parseNumberFlag(flags, "min-likes", 50, 0)),
    aboveAverageMultiple: parseNumberFlag(flags, "above-average-multiple", 1.5, 0),
    limit: Math.round(parseNumberFlag(flags, "limit", 12, 1)),
    topics: splitCsv(flags.topics, defaultTopics),
    includeMedia: Boolean(flags["include-media"]),
    json: Boolean(flags.json),
    out: typeof flags.out === "string" ? flags.out : undefined,
    model: typeof flags.model === "string" ? flags.model : "grok-4.3",
    fromDate,
    toDate: today,
  };
}

function buildPrompt(options: RadarOptions): string {
  return [
    "You are a growth marketing and AI ads research analyst building a daily X radar.",
    "Find interesting X posts and emerging voices about growth marketing, AI ads, paid social creative, UGC automation, creative testing, AI landing pages, ad generation, attribution, and growth technology.",
    "",
    `Date window: ${options.fromDate} through ${options.toDate}.`,
    `Seed handles to inspect and use as taste anchors: ${options.seedHandles.map((handle) => `@${handle}`).join(", ")}.`,
    `Minimum useful attention floor: about ${options.minLikes} likes unless a post is unusually novel or from a very small account.`,
    `Above-average attention signal: prefer posts that appear at least ${options.aboveAverageMultiple}x stronger than the author's normal recent post, when that baseline is visible. If the baseline is not visible, explain the proxy used or mark it inferred.`,
    `Return at most ${options.limit} ranked posts.`,
    `Topics: ${options.topics.join(", ")}.`,
    "",
    "Scoring rubric, each subscore 0-20 and total 0-100:",
    "- attention: likes/reposts/replies/views and above-author-baseline signal",
    "- novelty: non-obvious insight, fresh tactic, or emerging market signal",
    "- tactical_utility: can a growth/ad operator use this this week?",
    "- ai_ads_relevance: direct relevance to AI ads, creative automation, paid social, landing pages, or growth tech",
    "- emerging_voice: useful non-obvious author, not just mega-account consensus",
    "",
    "Selection rules:",
    "- Favor specific experiments, teardown threads, workflows, datasets, tool launches, prompts, before/after examples, benchmarks, and contrarian operator takes.",
    "- Down-rank generic AI hype, motivational content, obvious news summaries, and posts without a clear growth/ad application.",
    "- Include cited X status URLs for each selected post. If exact metrics are not available, use null and explain the attention proxy.",
    "- Keep exact_text_excerpt short and only use text visible from the post.",
    "- Suggest next-day parameter changes based on result quality.",
  ].join("\n");
}

function extractOutputText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks: string[] = [];
  for (const item of data.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

async function callXai(env: Env, options: RadarOptions): Promise<RadarReport> {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getRequired(env, "XAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: [{ role: "user", content: buildPrompt(options) }],
      tools: [
        {
          type: "x_search",
          from_date: options.fromDate,
          to_date: options.toDate,
          enable_image_understanding: options.includeMedia,
          enable_video_understanding: options.includeMedia,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "x_growth_radar_report",
          strict: true,
          schema: reportSchema,
        },
      },
    }),
  });

  const data = (await response.json()) as any;
  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? "Unknown xAI API error";
    throw new Error(`xAI API failed: ${response.status} ${message}`);
  }

  const text = extractOutputText(data);
  if (!text) throw new Error("xAI response did not include output text.");

  const report = JSON.parse(text) as RadarReport;
  report.generated_at = new Date().toISOString();
  report.window = {
    from_date: options.fromDate,
    to_date: options.toDate,
    lookback_days: options.days,
  };
  report.parameters = {
    seed_handles: options.seedHandles,
    topics: options.topics,
    min_likes: options.minLikes,
    above_average_multiple: options.aboveAverageMultiple,
    limit: options.limit,
    include_media: options.includeMedia,
  };
  normalizeReportHandles(report);
  report.citations = collectCitations(data, report);
  return report;
}

function normalizeReportHandles(report: RadarReport) {
  for (const post of report.posts) post.author_handle = normalizeHandle(post.author_handle);
  for (const voice of report.emerging_voices) voice.handle = normalizeHandle(voice.handle);
  report.parameter_notes.suggested_next_parameters.seed_handles =
    report.parameter_notes.suggested_next_parameters.seed_handles.map(normalizeHandle);
}

function collectCitations(data: any, report: RadarReport): string[] {
  const urls = new Set<string>();
  if (Array.isArray(data.citations)) {
    for (const url of data.citations) {
      if (typeof url === "string" && url) urls.add(url);
    }
  }
  for (const post of report.posts) {
    if (post.post_url) urls.add(post.post_url);
  }
  for (const voice of report.emerging_voices) {
    if (voice.profile_url) urls.add(voice.profile_url);
    if (voice.evidence_url) urls.add(voice.evidence_url);
  }
  for (const trend of report.tools_and_trends) {
    if (trend.evidence_url) urls.add(trend.evidence_url);
  }
  return [...urls];
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatMetric(value: number | null): string {
  return value === null ? "unknown" : value.toLocaleString("en-US");
}

function toMarkdown(report: RadarReport): string {
  const lines: string[] = [
    `# X Growth Radar - ${report.window.to_date}`,
    "",
    report.executive_summary,
    "",
    "## Parameters",
    "",
    `- Window: ${report.window.from_date} to ${report.window.to_date} (${report.window.lookback_days} days)`,
    `- Seed handles: ${report.parameters.seed_handles.map((handle) => `@${handle}`).join(", ")}`,
    `- Minimum likes: ${report.parameters.min_likes}`,
    `- Above-average multiple: ${report.parameters.above_average_multiple}`,
    `- Topics: ${report.parameters.topics.join(", ")}`,
    "",
    "## Ranked Posts",
    "",
    "| Rank | Post | Signal | Why it matters |",
    "|---:|---|---|---|",
  ];

  for (const post of report.posts) {
    const postLabel = post.post_url ? `[@${post.author_handle}](${post.post_url})` : `@${post.author_handle}`;
    const signal = [
      `score ${post.score.total}/100`,
      `${formatMetric(post.like_count)} likes`,
      post.above_average_signal,
      `confidence ${post.confidence}`,
    ].join("; ");
    lines.push(
      `| ${post.rank} | ${postLabel}<br>${escapeMarkdown(post.text_summary)} | ${escapeMarkdown(signal)} | ${escapeMarkdown(
        post.why_interesting,
      )} |`,
    );
  }

  lines.push("", "## Emerging Voices", "");
  for (const voice of report.emerging_voices) {
    const handle = voice.profile_url ? `[@${voice.handle}](${voice.profile_url})` : `@${voice.handle}`;
    const evidence = voice.evidence_url ? ` [evidence](${voice.evidence_url})` : "";
    lines.push(`- ${handle}: ${voice.why_follow}${evidence} (${voice.confidence})`);
  }

  lines.push("", "## Tools And Trends", "");
  for (const trend of report.tools_and_trends) {
    const evidence = trend.evidence_url ? ` [evidence](${trend.evidence_url})` : "";
    lines.push(`- ${trend.name} (${trend.category}): ${trend.why_it_matters}${evidence} (${trend.confidence})`);
  }

  lines.push(
    "",
    "## Next Parameters",
    "",
    report.parameter_notes.what_to_change_next,
    "",
    "```json",
    JSON.stringify(report.parameter_notes.suggested_next_parameters, null, 2),
    "```",
  );

  if (report.citations.length > 0) {
    lines.push("", "## Citations", "");
    for (const citation of report.citations.slice(0, 40)) lines.push(`- ${citation}`);
  }

  return `${lines.join("\n")}\n`;
}

function writeOutputs(report: RadarReport, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const stamp = report.window.to_date;
  const markdownPath = path.join(outDir, `x-growth-radar-${stamp}.md`);
  const jsonPath = path.join(outDir, `x-growth-radar-${stamp}.json`);
  writeFileSync(markdownPath, toMarkdown(report));
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`Wrote ${markdownPath}`);
  console.error(`Wrote ${jsonPath}`);
}

function selfTest() {
  const { flags } = parseArgs(["daily", "--seed", "https://x.com/rileybrown", "--days", "7", "--min-likes", "50"]);
  const options = buildOptions(flags);
  if (options.seedHandles[0] !== "rileybrown") throw new Error("handle normalization failed");
  if (options.minLikes !== 50) throw new Error("min likes parsing failed");
  if (!buildPrompt(options).includes("@rileybrown")) throw new Error("prompt generation failed");
  const sample: RadarReport = {
    generated_at: new Date("2026-05-22T00:00:00.000Z").toISOString(),
    window: { from_date: "2026-05-16", to_date: "2026-05-22", lookback_days: 7 },
    parameters: {
      seed_handles: ["rileybrown"],
      topics: defaultTopics,
      min_likes: 50,
      above_average_multiple: 1.5,
      limit: 1,
      include_media: false,
    },
    executive_summary: "Sample report.",
    posts: [],
    emerging_voices: [],
    tools_and_trends: [],
    parameter_notes: {
      what_worked: "Sample.",
      what_to_change_next: "Sample.",
      suggested_next_parameters: {
        days: 7,
        min_likes: 50,
        above_average_multiple: 1.5,
        seed_handles: ["rileybrown"],
        topics: defaultTopics,
      },
    },
    citations: [],
  };
  if (!toMarkdown(sample).includes("X Growth Radar")) throw new Error("markdown rendering failed");
  console.log("x-growth-radar self-test passed.");
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === "help" || !["daily", "self-test"].includes(command)) {
    console.log(usage());
    return;
  }

  if (command === "self-test") {
    selfTest();
    return;
  }

  const options = buildOptions(flags);
  const report = await callXai(loadEnv(), options);

  if (options.out) writeOutputs(report, options.out);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(toMarkdown(report));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
