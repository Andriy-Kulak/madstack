#!/usr/bin/env tsx
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DEFAULT_VIDEO_MODEL,
  analyzeVideo,
  resolveGeminiApiKey,
  supportedVideoExtensions,
} from "../src/video-analyzer.js";

const server = new McpServer({
  name: "madstack-video-analyzer",
  version: "0.1.0",
});

server.registerTool(
  "check_video_analyzer_config",
  {
    title: "Check video analyzer configuration",
    description: "Checks whether the MCP server process has a Gemini API key configured without revealing the key.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const configured = Boolean(resolveGeminiApiKey(process.env));
    return {
      content: [
        {
          type: "text",
          text: configured
            ? "Gemini API key is configured for this MCP server."
            : "Gemini API key is missing. Add GEMINI_API_KEY or GOOGLE_API_KEY to this MCP server's env config.",
        },
      ],
      structuredContent: {
        configured,
        acceptedEnvVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      },
    };
  },
);

server.registerTool(
  "analyze_video",
  {
    title: "Analyze video",
    description: "Analyze a local video file or public YouTube URL with Gemini and return an accuracy-focused markdown report.",
    inputSchema: {
      input: z.string().min(1).describe("Absolute or client-accessible local video path, or public YouTube URL."),
      mode: z.enum(["general", "ad"]).optional().default("general").describe("Use general for neutral analysis; use ad only for paid-social creative teardown."),
      prompt: z.string().optional().describe("Optional custom question, output format, or focus area."),
      model: z.string().optional().default(DEFAULT_VIDEO_MODEL).describe("Gemini model name."),
      fps: z.number().positive().optional().describe("Optional video frame sampling rate."),
      start: z.string().optional().describe("Optional start offset, for example 12s."),
      end: z.string().optional().describe("Optional end offset, for example 45s."),
      keepUploadedFile: z.boolean().optional().default(false).describe("Keep uploaded Gemini File API objects instead of deleting local-file uploads after analysis."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const result = await analyzeVideo({
        input: args.input,
        mode: args.mode,
        prompt: args.prompt,
        model: args.model,
        fps: args.fps,
        start: args.start,
        end: args.end,
        keepUploadedFile: args.keepUploadedFile,
        env: process.env,
        onProgress: (message) => console.error(message),
      });

      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: {
          model: result.model,
          mode: result.mode,
          inputType: result.inputType,
          uploadedFileName: result.uploadedFileName,
          uploadedFileUri: result.uploadedFileUri,
          deletedUploadedFile: result.deletedUploadedFile,
        },
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  },
);

server.registerTool(
  "list_supported_video_extensions",
  {
    title: "List supported video extensions",
    description: "Returns the local video extensions accepted by the analyzer before upload.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [{ type: "text", text: supportedVideoExtensions().join(", ") }],
    structuredContent: { extensions: supportedVideoExtensions() },
  }),
);

await server.connect(new StdioServerTransport());
