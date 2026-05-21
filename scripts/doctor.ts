import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string>;

const root = process.cwd();
const target = process.argv[2] ?? "all";
let failures = 0;

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
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
  };
}

function pass(message: string) {
  console.log(`ok   ${message}`);
}

function warn(message: string) {
  console.log(`warn ${message}`);
}

function fail(message: string) {
  failures += 1;
  console.log(`fail ${message}`);
}

function hasValue(env: Env, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function checkRepo() {
  if (!existsSync(path.join(root, "package.json"))) fail("Run doctor from the madstack repo root.");
  else pass("repo root detected");

  if (!existsSync(path.join(root, "node_modules"))) warn("dependencies are not installed; run npm install");
  else pass("node_modules present");

  const skillsRoot = path.join(root, "skills");
  if (!existsSync(skillsRoot)) {
    fail("skills directory is missing");
    return;
  }

  const skills = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name);

  if (skills.length === 0) fail("no skills found under skills/");
  else pass(`skills found: ${skills.join(", ")}`);
}

function checkEnvFile() {
  if (existsSync(path.join(root, ".env.local"))) pass(".env.local present");
  else warn(".env.local missing; copy .env.example to .env.local when you need provider credentials");
}

function checkGemini(env: Env) {
  if (hasValue(env, "GEMINI_API_KEY") || hasValue(env, "GOOGLE_API_KEY")) {
    pass("Gemini key configured via GEMINI_API_KEY or GOOGLE_API_KEY");
  } else {
    warn("Gemini video analysis needs GEMINI_API_KEY or GOOGLE_API_KEY");
  }
}

function checkFal(env: Env) {
  if (hasValue(env, "FAL_KEY")) pass("fal.ai key configured via FAL_KEY");
  else warn("fal.ai generation needs a configured fal MCP/tool integration, or FAL_KEY in that tool's environment");
}

function checkChrome(env: Env) {
  const candidates = [
    env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean) as string[];

  if (candidates.some((candidate) => existsSync(candidate))) pass("Chrome/Chromium available for Meta Ads fallback");
  else warn("Meta Ads browser fallback may need Chrome/Chromium or CHROME_PATH");
}

function checkGoogleAds(env: Env) {
  const required = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  ];
  const missing = required.filter((key) => !hasValue(env, key));

  if (missing.length === 0) pass("Google Ads required env vars are configured");
  else warn(`Google Ads API setup missing: ${missing.join(", ")}`);

  for (const key of ["GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_CUSTOMER_ID"]) {
    const value = env[key]?.trim();
    if (value && !/^\d{10}$/.test(value.replace(/\D/g, ""))) {
      warn(`${key} should be a 10-digit customer ID; hyphens are okay in .env.local`);
    }
  }
}

function shouldRun(name: string): boolean {
  return target === "all" || target === name;
}

if (!["all", "gemini", "fal", "meta", "google-ads"].includes(target)) {
  fail("Usage: npm run doctor -- [gemini|fal|meta|google-ads]");
  process.exit(1);
}

const env = loadEnv();
checkRepo();
checkEnvFile();
if (shouldRun("gemini")) checkGemini(env);
if (shouldRun("fal")) checkFal(env);
if (shouldRun("meta")) checkChrome(env);
if (shouldRun("google-ads")) checkGoogleAds(env);

if (failures > 0) process.exit(1);
