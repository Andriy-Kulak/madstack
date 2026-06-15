#!/usr/bin/env tsx
import { DEFAULT_VIDEO_MODEL, analyzeVideo, loadEnv } from "../../../src/video-analyzer.js";
import type { AnalyzeVideoOptions, VideoAnalysisMode } from "../../../src/video-analyzer.js";

interface CliOptions {
  input: string;
  mode: VideoAnalysisMode;
  prompt?: string;
  model: string;
  fps?: number;
  start?: string;
  end?: string;
  save?: string;
  keepUploadedFile?: boolean;
}

function usage(): never {
  console.error(`Usage: npm run analyze-video -- <video-path-or-youtube-url> [options]

Options:
  --mode general|ad
  --prompt "custom question or output format"
  --model ${DEFAULT_VIDEO_MODEL}
  --fps 2
  --start 12s
  --end 45s
  --save analysis.md
  --keep-file`);
  process.exit(2);
}

function parseArgs(argv: string[]): CliOptions {
  const input = argv[0];
  if (!input || input.startsWith("--")) usage();

  const opts: CliOptions = {
    input,
    mode: "general",
    model: DEFAULT_VIDEO_MODEL,
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
      case "--keep-file":
        opts.keepUploadedFile = true;
        break;
      default:
        usage();
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const analysisOptions: AnalyzeVideoOptions = {
    ...opts,
    env: loadEnv(),
    onProgress: (message) => console.error(message),
  };
  const result = await analyzeVideo(analysisOptions);
  console.log(result.text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
