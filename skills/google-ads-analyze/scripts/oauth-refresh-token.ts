#!/usr/bin/env tsx
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string>;

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
  return {
    ...parseEnvFile(path.join(process.cwd(), ".env")),
    ...parseEnvFile(path.join(process.cwd(), ".env.local")),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
  };
}

function setLocalEnv(key: string, value: string) {
  const envPath = path.join(process.cwd(), ".env.local");
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  let replaced = false;

  const next = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) next.push(`${key}=${value}`);
  writeFileSync(envPath, `${next.filter((line, index) => line || index < next.length - 1).join("\n")}\n`);
}

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required(env, "GOOGLE_ADS_CLIENT_ID"),
      client_secret: required(env, "GOOGLE_ADS_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = (await response.json()) as { refresh_token?: string; error?: string; error_description?: string };

  if (!response.ok || !data.refresh_token) {
    throw new Error(`Token exchange failed: ${data.error ?? response.status} ${data.error_description ?? ""}`.trim());
  }

  return data.refresh_token;
}

async function main() {
  const env = loadEnv();
  const port = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8080);
  if (!Number.isInteger(port) || port <= 0) throw new Error("Invalid --port value.");

  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const state = crypto.randomUUID();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: required(env, "GOOGLE_ADS_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", redirectUri);
      if (requestUrl.pathname !== "/oauth2callback") {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      if (requestUrl.searchParams.get("state") !== state) {
        response.writeHead(400);
        response.end("State mismatch.");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      if (error) {
        response.writeHead(400);
        response.end(`Google returned error: ${error}`);
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        response.writeHead(400);
        response.end("Missing authorization code.");
        return;
      }

      const refreshToken = await exchangeCode(env, code, redirectUri);
      setLocalEnv("GOOGLE_ADS_REFRESH_TOKEN", refreshToken);

      response.writeHead(200, { "content-type": "text/html" });
      response.end("<h1>Google Ads OAuth connected</h1><p>Refresh token saved to .env.local. You can close this tab.</p>");
      console.log("Saved GOOGLE_ADS_REFRESH_TOKEN to .env.local.");
      server.close();
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
      console.error(error instanceof Error ? error.message : String(error));
      server.close();
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Listening on ${redirectUri}`);
    console.log("Open this URL in a browser signed into the Google Ads user account:");
    console.log(authUrl.toString());
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
