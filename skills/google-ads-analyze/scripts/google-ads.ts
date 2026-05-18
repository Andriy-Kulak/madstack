#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Env = Record<string, string>;

type Command = "accounts" | "campaigns" | "performance" | "help";

const defaultApiVersion = "v21";

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
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function normalizeCustomerId(value: string): string {
  const id = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(id)) {
    throw new Error(`Customer ID must be 10 digits after removing hyphens: ${value}`);
  }
  return id;
}

function parseArgs(argv: string[]) {
  const command = (argv[0] ?? "help") as Command;
  const flags: Record<string, string | boolean> = {};

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
    "  npm run google-ads -- accounts [--json]",
    "  npm run google-ads -- campaigns --customer 2239799476 [--json]",
    "  npm run google-ads -- performance --customer 2239799476 --from YYYY-MM-DD --to YYYY-MM-DD [--json]",
    "",
    "Required env:",
    "  GOOGLE_ADS_DEVELOPER_TOKEN",
    "  GOOGLE_ADS_CLIENT_ID",
    "  GOOGLE_ADS_CLIENT_SECRET",
    "  GOOGLE_ADS_REFRESH_TOKEN",
    "  GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  ].join("\n");
}

async function refreshAccessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: getRequired(env, "GOOGLE_ADS_CLIENT_ID"),
    client_secret: getRequired(env, "GOOGLE_ADS_CLIENT_SECRET"),
    refresh_token: getRequired(env, "GOOGLE_ADS_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(`OAuth refresh failed: ${data.error ?? response.status} ${data.error_description ?? ""}`.trim());
  }

  return data.access_token;
}

async function googleAdsRequest<T>(
  env: Env,
  accessToken: string,
  pathName: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const apiVersion = env.GOOGLE_ADS_API_VERSION || defaultApiVersion;
  const url = `https://googleads.googleapis.com/${apiVersion}/${pathName}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "developer-token": getRequired(env, "GOOGLE_ADS_DEVELOPER_TOKEN"),
  };

  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = normalizeCustomerId(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  }

  if (options.body) headers["content-type"] = "application/json";

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = (await response.json()) as T & { error?: { status?: string; message?: string } };

  if (!response.ok) {
    const status = data.error?.status ?? response.status;
    const message = data.error?.message ?? "Unknown Google Ads API error";
    throw new Error(`Google Ads API failed: ${status} ${message}`);
  }

  return data;
}

async function searchStream(env: Env, accessToken: string, customerId: string, query: string): Promise<any[]> {
  const normalized = normalizeCustomerId(customerId);
  return googleAdsRequest<any[]>(env, accessToken, `customers/${normalized}/googleAds:searchStream`, {
    method: "POST",
    body: { query },
  });
}

function flattenResults(chunks: any[]): any[] {
  return chunks.flatMap((chunk) => chunk.results ?? []);
}

function asMoney(micros: string | number | undefined): number {
  return Number(micros ?? 0) / 1_000_000;
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printAccounts(data: { resourceNames?: string[] }, json: boolean) {
  const accounts = (data.resourceNames ?? []).map((resourceName) => ({
    customerId: resourceName.replace("customers/", ""),
    resourceName,
  }));

  if (json) return printJson(accounts);

  console.log(`Accessible customers: ${accounts.length}`);
  for (const account of accounts) console.log(`${account.customerId}\t${account.resourceName}`);
}

function printCampaigns(rows: any[], json: boolean) {
  const campaigns = rows.map((row) => {
    const campaign = row.campaign ?? {};
    const budget = row.campaignBudget ?? {};
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: campaign.advertisingChannelType,
      servingStatus: campaign.servingStatus,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      budget: asMoney(budget.amountMicros),
      budgetName: budget.name,
    };
  });

  if (json) return printJson(campaigns);

  console.log(`Campaigns: ${campaigns.length}`);
  for (const campaign of campaigns) {
    console.log(
      [
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.channel,
        campaign.servingStatus,
        `$${campaign.budget.toFixed(2)}/day`,
        `start=${campaign.startDate}`,
        `end=${campaign.endDate}`,
      ].join("\t"),
    );
  }
}

function printPerformance(rows: any[], json: boolean) {
  const campaigns = rows.map((row) => {
    const campaign = row.campaign ?? {};
    const metrics = row.metrics ?? {};
    const cost = asMoney(metrics.costMicros);
    const conversions = Number(metrics.conversions ?? 0);
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: campaign.advertisingChannelType,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      cost,
      conversions,
      conversionValue: Number(metrics.conversionsValue ?? 0),
      ctr: Number(metrics.ctr ?? 0),
      averageCpc: asMoney(metrics.averageCpc),
      costPerConversion: conversions > 0 ? cost / conversions : null,
    };
  });

  if (json) return printJson(campaigns);

  console.log(`Campaign performance rows: ${campaigns.length}`);
  for (const campaign of campaigns) {
    console.log(
      [
        campaign.id,
        campaign.name,
        `cost=$${campaign.cost.toFixed(2)}`,
        `clicks=${campaign.clicks}`,
        `impr=${campaign.impressions}`,
        `conv=${campaign.conversions}`,
        `cpa=${campaign.costPerConversion === null ? "-" : `$${campaign.costPerConversion.toFixed(2)}`}`,
        `ctr=${(campaign.ctr * 100).toFixed(2)}%`,
      ].join("\t"),
    );
  }
}

async function main() {
  const env = loadEnv();
  const { command, flags } = parseArgs(process.argv.slice(2));
  const json = Boolean(flags.json);

  if (command === "help" || !["accounts", "campaigns", "performance"].includes(command)) {
    console.log(usage());
    return;
  }

  const accessToken = await refreshAccessToken(env);

  if (command === "accounts") {
    const data = await googleAdsRequest<{ resourceNames?: string[] }>(
      env,
      accessToken,
      "customers:listAccessibleCustomers",
    );
    printAccounts(data, json);
    return;
  }

  const customer = typeof flags.customer === "string" ? flags.customer : env.GOOGLE_ADS_CUSTOMER_ID;
  if (!customer) throw new Error("Missing --customer or GOOGLE_ADS_CUSTOMER_ID.");

  if (command === "campaigns") {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.serving_status,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros,
        campaign_budget.name
      FROM campaign
      ORDER BY campaign.name
    `;
    printCampaigns(flattenResults(await searchStream(env, accessToken, customer, query)), json);
    return;
  }

  const from = flags.from;
  const to = flags.to;
  if (typeof from !== "string" || typeof to !== "string") {
    throw new Error("performance requires --from YYYY-MM-DD and --to YYYY-MM-DD.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("--from and --to must use YYYY-MM-DD.");
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
    ORDER BY metrics.cost_micros DESC
  `;
  printPerformance(flattenResults(await searchStream(env, accessToken, customer, query)), json);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
