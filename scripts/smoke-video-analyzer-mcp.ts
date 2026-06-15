#!/usr/bin/env tsx
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = process.cwd();
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "mcp", "video-analyzer-server.ts"),
  ],
  cwd: root,
  env: {
    ...getDefaultEnvironment(),
    GEMINI_API_KEY: "smoke-test-placeholder-key",
  },
  stderr: "pipe",
});

const client = new Client({ name: "madstack-mcp-smoke-test", version: "0.1.0" });

function textContentFromResult(result: unknown): string {
  const maybe = result as { content?: Array<{ type: string; text?: string }> };
  return maybe.content
    ?.map((part) => part.type === "text" ? part.text ?? "" : "")
    .join("\n") ?? JSON.stringify(result);
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const requiredTools = [
    "analyze_video",
    "check_video_analyzer_config",
    "list_supported_video_extensions",
  ];
  const missing = requiredTools.filter((tool) => !toolNames.includes(tool));
  if (missing.length > 0) {
    throw new Error(`MCP smoke test missing tools: ${missing.join(", ")}`);
  }

  const configResult = await client.callTool({ name: "check_video_analyzer_config", arguments: {} });
  const configText = textContentFromResult(configResult);
  if (!configText.includes("configured")) {
    throw new Error("MCP smoke test did not receive expected config response.");
  }
  if (configText.includes("smoke-test-placeholder-key")) {
    throw new Error("MCP smoke test leaked the API key value.");
  }

  console.log(`ok MCP server started and exposed tools: ${toolNames.join(", ")}`);
} finally {
  await client.close();
}
