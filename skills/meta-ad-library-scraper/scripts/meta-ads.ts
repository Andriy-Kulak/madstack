#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

type JsonObject = Record<string, unknown>;

type PageInfo = {
  end_cursor?: string | null;
  has_next_page?: boolean;
};

type SearchConnection = {
  count?: number;
  edges?: Array<{ node?: { collated_results?: RawAd[] } }>;
  page_info?: PageInfo;
};

type RawAd = {
  ad_archive_id?: string;
  collation_id?: string | null;
  collation_count?: number | null;
  is_active?: boolean;
  page_id?: string;
  page_is_deleted?: boolean;
  publisher_platform?: string[];
  start_date?: number | null;
  end_date?: number | null;
  snapshot?: RawSnapshot | null;
};

type RawSnapshot = {
  page_id?: string;
  page_name?: string;
  page_profile_uri?: string;
  page_profile_picture_url?: string;
  page_categories?: string[];
  page_like_count?: number;
  display_format?: string;
  body?: { text?: string } | null;
  title?: string | null;
  caption?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  link_description?: string | null;
  link_url?: string | null;
  images?: Array<Record<string, unknown>>;
  videos?: Array<Record<string, unknown>>;
  cards?: Array<Record<string, unknown>>;
};

type NormalizedAd = {
  ad_archive_id: string;
  ad_library_url: string;
  collation_id: string | null;
  collation_count: number | null;
  is_active: boolean | null;
  page_id: string | null;
  page_name: string | null;
  page_profile_uri: string | null;
  page_profile_picture_url: string | null;
  page_categories: string[];
  page_like_count: number | null;
  display_format: string | null;
  body_text: string | null;
  title: string | null;
  caption: string | null;
  cta_text: string | null;
  cta_type: string | null;
  link_description: string | null;
  link_url: string | null;
  images: Array<Record<string, unknown>>;
  videos: Array<Record<string, unknown>>;
  cards: Array<Record<string, unknown>>;
  publisher_platform: string[];
  start_date: number | null;
  end_date: number | null;
  collected_at: string;
};

type ScrapeResult = {
  metadata: {
    source_url: string;
    requested_limit: number | "all";
    declared_count: number | null;
    returned_count: number;
    complete: boolean;
    pagination_attempted: boolean;
    browser_fallback_used: boolean;
    warnings: string[];
    collected_at: string;
  };
  ads: NormalizedAd[];
};

type DownloadedAd = {
  ad_archive_id: string;
  title: string | null;
  body_text: string | null;
  cta_text: string | null;
  link_url: string | null;
  ad_library_url: string;
  display_format: string | null;
  video_file: string | null;
  image_file: string | null;
  preview_file: string | null;
  source_video_url: string | null;
  source_image_url: string | null;
  source_preview_url: string | null;
  errors: string[];
};

type MediaSources = {
  sourceVideoUrl: string | null;
  sourceImageUrl: string | null;
  sourcePreviewUrl: string | null;
};

type ArchiveOptions = {
  url: string;
  out: string | null;
  limit: number | "all";
  downloadLimit: number | "all" | null;
  yes: boolean;
  concurrency: number;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
};

const DEFAULT_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const VIDEO_URL_KEYS = ["video_hd_url", "video_sd_url"];
const IMAGE_URL_KEYS = ["original_image_url", "resized_image_url", "watermarked_resized_image_url"];
const PREVIEW_URL_KEYS = ["video_preview_image_url"];

function usage(exitCode = 1): never {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  npm run meta-ads -- scrape-url "<facebook-ads-library-url>" [--limit all|N] [--json|--jsonl]
  npm run meta-ads -- download-media <scrape.json> [--out meta-files/sonito-media] [--max all|N] [--yes]
  npm run meta-ads -- archive-url "<facebook-ads-library-url>" [--out meta-files/brand] [--download-limit all|N] [--yes]
  npm run meta-ads:test
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "help") usage(0);
  if (command === "self-test") return { command } as const;
  if (command === "archive-url") return parseArchiveArgs(rest);
  if (command === "download-media") {
    let input = "";
    let out = "meta-files/media";
    let max: number | "all" = "all";
    let yes = false;
    let concurrency = 6;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--out") {
        out = rest[++i] ?? "";
        if (!out) throw new Error("--out requires a directory.");
      } else if (arg === "--max") {
        max = parseLimit(rest[++i], "--max");
      } else if (arg === "--yes") {
        yes = true;
      } else if (arg === "--concurrency") {
        concurrency = parsePositiveInteger(rest[++i], "--concurrency");
      } else if (!input) {
        input = arg;
      } else {
        throw new Error(`Unexpected argument: ${arg}`);
      }
    }
    if (!input) throw new Error("download-media requires a scrape JSON file.");
    return { command, input, out, max, yes, concurrency } as const;
  }
  if (command !== "scrape-url") usage();

  let url = "";
  let limit: number | "all" = "all";
  let format: "json" | "jsonl" = "json";

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--limit") {
      limit = parseLimit(rest[++i], "--limit");
    } else if (arg === "--json") {
      format = "json";
    } else if (arg === "--jsonl") {
      format = "jsonl";
    } else if (!url) {
      url = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!url) throw new Error("scrape-url requires a Meta Ads Library URL.");
  validateAdLibraryUrl(url);
  return { command, url, limit, format } as const;
}

function parseArchiveArgs(rest: string[]): { command: "archive-url" } & ArchiveOptions {
  let url = "";
  let out: string | null = null;
  let limit: number | "all" = "all";
  let downloadLimit: number | "all" | null = null;
  let yes = false;
  let concurrency = 6;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--out") {
      out = rest[++i] ?? "";
      if (!out) throw new Error("--out requires a directory.");
    } else if (arg === "--limit") {
      limit = parseLimit(rest[++i], "--limit");
    } else if (arg === "--download-limit") {
      downloadLimit = parseLimit(rest[++i], "--download-limit");
    } else if (arg === "--yes") {
      yes = true;
    } else if (arg === "--concurrency") {
      concurrency = parsePositiveInteger(rest[++i], "--concurrency");
    } else if (!url) {
      url = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!url) throw new Error("archive-url requires a Meta Ads Library URL.");
  validateAdLibraryUrl(url);
  return { command: "archive-url", url, out, limit, downloadLimit, yes, concurrency };
}

function parseLimit(raw: string | undefined, flag: string): number | "all" {
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

function validateAdLibraryUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!url.hostname.endsWith("facebook.com") || !url.pathname.startsWith("/ads/library")) {
    throw new Error("Expected a facebook.com/ads/library URL.");
  }
}

function normalizeAdLibraryUrl(rawUrl: string): string {
  validateAdLibraryUrl(rawUrl);
  const url = new URL(rawUrl);
  url.hostname = "www.facebook.com";
  return url.toString();
}

function collectSetCookie(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];
  const fallback = headers.get("set-cookie");
  if (fallback) cookies.push(fallback);
  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean);
}

async function fetchAdLibraryHtml(url: string): Promise<{ html: string; cookie: string }> {
  let response = await fetch(url, { headers: DEFAULT_HEADERS });
  let html = await response.text();
  let cookieParts = collectSetCookie(response.headers);

  const challengePath = html.match(/fetch\('([^']+)'/)?.[1];
  if (response.status === 403 && challengePath) {
    const challengeUrl = new URL(challengePath, url).toString();
    const challengeResponse = await fetch(challengeUrl, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        origin: "https://www.facebook.com",
        referer: url,
        "sec-fetch-site": "same-origin",
      },
    });
    cookieParts = [...cookieParts, ...collectSetCookie(challengeResponse.headers)];
    const cookie = cookieParts.join("; ");
    response = await fetch(url, {
      headers: {
        ...DEFAULT_HEADERS,
        cookie,
        "sec-fetch-site": "same-origin",
      },
    });
    html = await response.text();
  }

  if (response.status >= 400) {
    throw new Error(`Meta returned HTTP ${response.status} while fetching Ads Library HTML.`);
  }

  return { html, cookie: cookieParts.join("; ") };
}

function extractBalancedObject(source: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
    } else if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error("Could not extract balanced JSON object from Meta payload.");
}

function extractSearchConnection(html: string): SearchConnection {
  const marker = "\"search_results_connection\":";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error("Could not find search_results_connection in Meta payload.");

  const objectStart = html.indexOf("{", markerIndex + marker.length);
  if (objectStart === -1) throw new Error("Could not find search_results_connection object start.");

  return JSON.parse(extractBalancedObject(html, objectStart)) as SearchConnection;
}

function extractGraphqlSearchConnection(text: string): SearchConnection | null {
  const jsonText = text.startsWith("for (;;);") ? text.slice("for (;;);".length) : text;
  const parsed = JSON.parse(jsonText) as JsonObject;
  const data = parsed.data as JsonObject | undefined;
  const main = data?.ad_library_main as JsonObject | undefined;
  return (main?.search_results_connection as SearchConnection | undefined) ?? null;
}

function extractInitialVariables(html: string): JsonObject | null {
  const match = html.match(/"variables":(\{"adType":"ALL".*?\}),"queryName":"AdLibraryFoundationRootQuery"/);
  if (!match?.[1]) return null;
  return JSON.parse(match[1]) as JsonObject;
}

function extractLsd(html: string): string | null {
  return html.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1] ?? null;
}

function extractSiteData(html: string) {
  return {
    revision: html.match(/"__spin_r":(\d+)/)?.[1] ?? null,
    hasteSession: html.match(/"haste_session":"([^"]+)"/)?.[1] ?? null,
    hsi: html.match(/"hsi":"([^"]+)"/)?.[1] ?? null,
  };
}

function jazoest(token: string): string {
  return `2${[...token].reduce((sum, char) => sum + char.charCodeAt(0), 0)}`;
}

function extractScriptUrls(html: string): string[] {
  return [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")))]
    .filter((url) => url.startsWith("https://static.xx.fbcdn.net/"));
}

async function discoverPaginationDocId(html: string): Promise<string | null> {
  for (const scriptUrl of extractScriptUrls(html)) {
    const response = await fetch(scriptUrl, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) continue;
    const script = await response.text();
    const match = script.match(/AdLibrarySearchPaginationQuery_facebookRelayOperation",\[\],\(function\([^)]*\)\{a\.exports="(\d+)"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function rawAdsFromConnection(connection: SearchConnection): RawAd[] {
  return (connection.edges ?? []).flatMap((edge) => edge.node?.collated_results ?? []);
}

function normalizedAdsFromConnection(connection: SearchConnection, collectedAt: string): NormalizedAd[] {
  return rawAdsFromConnection(connection)
    .map((ad) => normalizeAd(ad, collectedAt))
    .filter((ad): ad is NormalizedAd => ad !== null);
}

function normalizeAd(raw: RawAd, collectedAt: string): NormalizedAd | null {
  const id = raw.ad_archive_id;
  if (!id) return null;
  const snapshot = raw.snapshot ?? {};

  return {
    ad_archive_id: id,
    ad_library_url: `https://www.facebook.com/ads/library/?id=${id}`,
    collation_id: raw.collation_id ?? null,
    collation_count: raw.collation_count ?? null,
    is_active: typeof raw.is_active === "boolean" ? raw.is_active : null,
    page_id: raw.page_id ?? snapshot.page_id ?? null,
    page_name: snapshot.page_name ?? null,
    page_profile_uri: snapshot.page_profile_uri ?? null,
    page_profile_picture_url: snapshot.page_profile_picture_url ?? null,
    page_categories: Array.isArray(snapshot.page_categories) ? snapshot.page_categories : [],
    page_like_count: typeof snapshot.page_like_count === "number" ? snapshot.page_like_count : null,
    display_format: snapshot.display_format ?? null,
    body_text: snapshot.body?.text ?? null,
    title: snapshot.title ?? null,
    caption: snapshot.caption ?? null,
    cta_text: snapshot.cta_text ?? null,
    cta_type: snapshot.cta_type ?? null,
    link_description: snapshot.link_description ?? null,
    link_url: snapshot.link_url ?? null,
    images: Array.isArray(snapshot.images) ? snapshot.images : [],
    videos: Array.isArray(snapshot.videos) ? snapshot.videos : [],
    cards: Array.isArray(snapshot.cards) ? snapshot.cards : [],
    publisher_platform: Array.isArray(raw.publisher_platform) ? raw.publisher_platform : [],
    start_date: raw.start_date ?? null,
    end_date: raw.end_date ?? null,
    collected_at: collectedAt,
  };
}

function uniqueAds(ads: NormalizedAd[]): NormalizedAd[] {
  const seen = new Set<string>();
  const out: NormalizedAd[] = [];
  for (const ad of ads) {
    if (seen.has(ad.ad_archive_id)) continue;
    seen.add(ad.ad_archive_id);
    out.push(ad);
  }
  return out;
}

function uniqueAdCount(ads: NormalizedAd[]): number {
  return new Set(ads.map((ad) => ad.ad_archive_id)).size;
}

function paginationVariables(initialVariables: JsonObject, cursor: string): JsonObject {
  return {
    activeStatus: initialVariables.activeStatus,
    adType: initialVariables.adType,
    bylines: initialVariables.bylines ?? [],
    collationToken: initialVariables.collationToken ?? null,
    contentLanguages: initialVariables.contentLanguages ?? [],
    countries: initialVariables.countries ?? ["ALL"],
    cursor,
    excludedIDs: initialVariables.excludedIDs ?? null,
    first: 30,
    isTargetedCountry: initialVariables.isTargetedCountry ?? false,
    location: initialVariables.location ?? null,
    mediaType: initialVariables.mediaType ?? "all",
    multiCountryFilterMode: initialVariables.multiCountryFilterMode ?? null,
    pageIDs: initialVariables.pageIDs ?? [],
    potentialReachInput: initialVariables.potentialReachInput ?? null,
    publisherPlatforms: initialVariables.publisherPlatforms ?? [],
    queryString: initialVariables.queryString ?? "",
    regions: initialVariables.regions ?? null,
    searchType: initialVariables.searchType ?? "page",
    sessionID: initialVariables.sessionID ?? null,
    sortData: initialVariables.sortData ?? null,
    source: initialVariables.source ?? null,
    startDate: initialVariables.startDate ?? null,
    v: initialVariables.v ?? null,
    viewAllPageID: initialVariables.viewAllPageID ?? null,
  };
}

async function fetchPaginationConnection(options: {
  sourceUrl: string;
  cookie: string;
  html: string;
  initialVariables: JsonObject;
  cursor: string;
}): Promise<SearchConnection> {
  const lsd = extractLsd(options.html);
  const siteData = extractSiteData(options.html);
  const docId = await discoverPaginationDocId(options.html);
  if (!lsd) throw new Error("Could not find Meta LSD token for pagination.");
  if (!docId) throw new Error("Could not discover AdLibrarySearchPaginationQuery doc_id.");

  const body = new URLSearchParams({
    av: "0",
    __user: "0",
    __a: "1",
    __req: "1",
    __hs: siteData.hasteSession ?? "",
    dpr: "2",
    __ccg: "EXCELLENT",
    __rev: siteData.revision ?? "",
    __s: "::",
    __hsi: siteData.hsi ?? "",
    __comet_req: "15",
    lsd,
    jazoest: jazoest(lsd),
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "AdLibrarySearchPaginationQuery",
    variables: JSON.stringify(paginationVariables(options.initialVariables, options.cursor)),
    server_timestamps: "true",
    doc_id: docId,
  });

  const response = await fetch("https://www.facebook.com/api/graphql/", {
    method: "POST",
    headers: {
      "user-agent": USER_AGENT,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.facebook.com",
      referer: options.sourceUrl,
      "x-asbd-id": "359341",
      "x-fb-friendly-name": "AdLibrarySearchPaginationQuery",
      "x-fb-lsd": lsd,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body,
  });

  const text = await response.text();
  const jsonText = text.startsWith("for (;;);") ? text.slice("for (;;);".length) : text;
  const parsed = JSON.parse(jsonText) as JsonObject;
  if (typeof parsed.error === "number") {
    const summary = typeof parsed.errorSummary === "string" ? parsed.errorSummary : "Meta rejected pagination request";
    const description = typeof parsed.errorDescription === "string" ? parsed.errorDescription : "";
    throw new Error(`${summary}${description ? `: ${description}` : ""}`);
  }

  const connection = extractGraphqlSearchConnection(text);
  if (!connection) throw new Error("Pagination response did not include search_results_connection.");
  return connection;
}

function chromeExecutablePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of DEFAULT_CHROME_PATHS) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  throw new Error("Could not find Chrome/Chromium for browser fallback. Set CHROME_PATH to the executable.");
}

async function scrapeWithBrowserFallback(options: {
  sourceUrl: string;
  collectedAt: string;
  declaredCount: number | null;
  maxAds: number;
  seedAds: NormalizedAd[];
}): Promise<NormalizedAd[]> {
  const browser = await chromium.launch({
    executablePath: chromeExecutablePath(),
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const ads = [...options.seedAds];
  const pendingResponses: Array<Promise<void>> = [];

  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    page.on("response", (response) => {
      if (!response.url().includes("/api/graphql/")) return;
      pendingResponses.push(
        response
          .text()
          .then((text) => {
            const connection = extractGraphqlSearchConnection(text);
            if (connection) ads.push(...normalizedAdsFromConnection(connection, options.collectedAt));
          })
          .catch(() => {
            // Some GraphQL responses are metrics or filter payloads. Ignore non-ad responses.
          }),
      );
    });

    await page.goto(options.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);

    try {
      const html = await page.content();
      ads.push(...normalizedAdsFromConnection(extractSearchConnection(html), options.collectedAt));
    } catch {
      // Hydrated DOM can omit the original SSR scripts; response capture is the primary browser path.
    }

    for (let i = 0; i < 20; i += 1) {
      const uniqueCount = uniqueAdCount(ads);
      if (uniqueCount >= options.maxAds) break;
      if (options.declaredCount !== null && uniqueCount >= options.declaredCount) break;

      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(1_500);
      await Promise.allSettled(pendingResponses);
    }

    await Promise.allSettled(pendingResponses);
    return uniqueAds(ads);
  } finally {
    await browser.close();
  }
}

async function scrapeUrl(sourceUrl: string, requestedLimit: number | "all"): Promise<ScrapeResult> {
  const normalizedUrl = normalizeAdLibraryUrl(sourceUrl);
  const collectedAt = new Date().toISOString();
  const warnings: string[] = [];
  const { html, cookie } = await fetchAdLibraryHtml(normalizedUrl);
  const initialConnection = extractSearchConnection(html);
  const initialVariables = extractInitialVariables(html);

  let paginationAttempted = false;
  let browserFallbackUsed = false;
  let allAds: NormalizedAd[] = normalizedAdsFromConnection(initialConnection, collectedAt);

  const declaredCount = typeof initialConnection.count === "number" ? initialConnection.count : null;
  const maxAds = requestedLimit === "all" ? Number.POSITIVE_INFINITY : requestedLimit;
  let pageInfo = initialConnection.page_info;

  while (
    initialVariables &&
    pageInfo?.has_next_page === true &&
    pageInfo.end_cursor &&
    uniqueAdCount(allAds) < maxAds &&
    (declaredCount === null || uniqueAdCount(allAds) < declaredCount)
  ) {
    paginationAttempted = true;
    try {
      const nextConnection = await fetchPaginationConnection({
        sourceUrl: normalizedUrl,
        cookie,
        html,
        initialVariables,
        cursor: pageInfo.end_cursor,
      });
      const nextAds = rawAdsFromConnection(nextConnection)
        .map((ad) => normalizeAd(ad, collectedAt))
        .filter((ad): ad is NormalizedAd => ad !== null);
      allAds.push(...nextAds);
      pageInfo = nextConnection.page_info;
      if (nextAds.length === 0) break;
    } catch (error) {
      const directPaginationError = error instanceof Error ? error.message : String(error);
      try {
        browserFallbackUsed = true;
        allAds = await scrapeWithBrowserFallback({
          sourceUrl: normalizedUrl,
          collectedAt,
          declaredCount,
          maxAds,
          seedAds: allAds,
        });
        warnings.push(`Direct pagination failed; browser fallback used: ${directPaginationError}`);
      } catch (fallbackError) {
        warnings.push(`Pagination fallback: ${directPaginationError}`);
        warnings.push(`Browser fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
      break;
    }
  }

  if (!initialVariables && initialConnection.page_info?.has_next_page) {
    warnings.push("Could not extract initial Relay variables; returned first server-rendered page only.");
  }

  const limitedAds = uniqueAds(allAds).slice(0, maxAds);
  const complete =
    requestedLimit !== "all" && limitedAds.length >= requestedLimit
      ? true
      : declaredCount !== null
        ? limitedAds.length >= declaredCount
        : pageInfo?.has_next_page !== true && warnings.length === 0;

  return {
    metadata: {
      source_url: normalizedUrl,
      requested_limit: requestedLimit,
      declared_count: declaredCount,
      returned_count: limitedAds.length,
      complete,
      pagination_attempted: paginationAttempted,
      browser_fallback_used: browserFallbackUsed,
      warnings,
      collected_at: collectedAt,
    },
    ads: limitedAds,
  };
}

function renderJsonl(result: ScrapeResult): string {
  const metadata = JSON.stringify({ type: "metadata", ...result.metadata });
  const ads = result.ads.map((ad) => JSON.stringify({ type: "ad", ...ad }));
  return [metadata, ...ads].join("\n");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "meta-ads";
}

function defaultArchiveDir(result: ScrapeResult): string {
  const pageName = result.ads.find((ad) => ad.page_name)?.page_name;
  const pageId = result.ads.find((ad) => ad.page_id)?.page_id;
  return path.join("meta-files", slugify(pageName ?? pageId ?? "meta-ads"));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstMediaUrl(records: Array<Record<string, unknown>>, keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function mediaSourcesForAd(ad: NormalizedAd): MediaSources {
  const mediaRecords = [...ad.images, ...ad.videos, ...ad.cards];
  return {
    sourceVideoUrl: firstMediaUrl(mediaRecords, VIDEO_URL_KEYS),
    sourceImageUrl: firstMediaUrl(mediaRecords, IMAGE_URL_KEYS),
    sourcePreviewUrl: firstMediaUrl(mediaRecords, PREVIEW_URL_KEYS),
  };
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch {
    // Use fallback below.
  }
  return fallback;
}

function safeText(value: string | null | undefined): string {
  return (value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function relativePath(fromDir: string, target: string | null): string | null {
  if (!target) return null;
  return path.relative(fromDir, target).replaceAll(path.sep, "/");
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  if (existsSync(outputPath)) return;
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, bytes);
}

function limitScrapeResult(input: ScrapeResult, max: number | "all"): ScrapeResult {
  if (max === "all") return input;
  return {
    ...input,
    metadata: {
      ...input.metadata,
      requested_limit: max,
      returned_count: Math.min(input.ads.length, max),
    },
    ads: input.ads.slice(0, max),
  };
}

function enforceLargeDownloadGuard(input: ScrapeResult, max: number | "all", yes: boolean): string | null {
  if (input.ads.length <= 100) return null;
  if (max !== "all" || yes) return null;
  return `This scrape has ${input.ads.length} ads. To avoid downloading a huge media archive by accident, rerun with --max N, --download-limit N, or --yes.`;
}

async function downloadMedia(inputPath: string, outDir: string, max: number | "all", yes: boolean, concurrency: number) {
  const rawInput = JSON.parse(readFileSync(inputPath, "utf8")) as ScrapeResult;
  const guard = enforceLargeDownloadGuard(rawInput, max, yes);
  if (guard) throw new Error(guard);
  const input = limitScrapeResult(rawInput, max);
  const manifest = await downloadMediaFromScrape(input, path.resolve(inputPath), outDir, concurrency);
  process.stdout.write(`${JSON.stringify({ output_dir: manifest.output_dir, ...manifest.counts }, null, 2)}\n`);
  return manifest;
}

async function downloadMediaFromScrape(input: ScrapeResult, sourceFile: string, outDir: string, concurrency: number) {
  const root = path.resolve(outDir);
  const videosDir = path.join(root, "videos");
  const imagesDir = path.join(root, "images");
  const previewsDir = path.join(root, "previews");
  mkdirSync(videosDir, { recursive: true });
  mkdirSync(imagesDir, { recursive: true });
  mkdirSync(previewsDir, { recursive: true });

  const downloaded: DownloadedAd[] = [];

  await runWithConcurrency(input.ads, concurrency, async (ad, index) => {
    const prefix = `${String(index + 1).padStart(3, "0")}_${ad.ad_archive_id}`;
    const { sourceVideoUrl, sourceImageUrl, sourcePreviewUrl } = mediaSourcesForAd(ad);
    const videoFile = sourceVideoUrl ? path.join(videosDir, `${prefix}${extensionFromUrl(sourceVideoUrl, ".mp4")}`) : null;
    const imageFile = sourceImageUrl ? path.join(imagesDir, `${prefix}${extensionFromUrl(sourceImageUrl, ".jpg")}`) : null;
    const previewFile = sourcePreviewUrl ? path.join(previewsDir, `${prefix}${extensionFromUrl(sourcePreviewUrl, ".jpg")}`) : null;
    const errors: string[] = [];

    await Promise.all(
      ([
      ["video", sourceVideoUrl, videoFile],
      ["image", sourceImageUrl, imageFile],
      ["preview", sourcePreviewUrl, previewFile],
    ] as const).map(async ([label, url, outputPath]) => {
      if (!url || !outputPath) return;
      try {
        await downloadFile(url, outputPath);
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
    );

    downloaded.push({
      ad_archive_id: ad.ad_archive_id,
      title: ad.title,
      body_text: ad.body_text,
      cta_text: ad.cta_text,
      link_url: ad.link_url,
      ad_library_url: ad.ad_library_url,
      display_format: ad.display_format,
      video_file: relativePath(root, videoFile),
      image_file: relativePath(root, imageFile),
      preview_file: relativePath(root, previewFile),
      source_video_url: sourceVideoUrl,
      source_image_url: sourceImageUrl,
      source_preview_url: sourcePreviewUrl,
      errors,
    });

    process.stderr.write(`Downloaded ${index + 1}/${input.ads.length}: ${ad.ad_archive_id}${errors.length ? " (with errors)" : ""}\n`);
  });

  downloaded.sort((a, b) => input.ads.findIndex((ad) => ad.ad_archive_id === a.ad_archive_id) - input.ads.findIndex((ad) => ad.ad_archive_id === b.ad_archive_id));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_file: sourceFile,
    output_dir: root,
    metadata: input.metadata,
    counts: {
      ads: downloaded.length,
      videos: downloaded.filter((ad) => ad.video_file && ad.errors.every((error) => !error.startsWith("video:"))).length,
      images: downloaded.filter((ad) => ad.image_file && ad.errors.every((error) => !error.startsWith("image:"))).length,
      previews: downloaded.filter((ad) => ad.preview_file && ad.errors.every((error) => !error.startsWith("preview:"))).length,
      errored_ads: downloaded.filter((ad) => ad.errors.length > 0).length,
    },
    ads: downloaded,
  };

  writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(root, "index.html"), renderMediaIndex(manifest.ads, manifest.counts));
  return manifest;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    }),
  );
}

async function archiveUrl(options: ArchiveOptions) {
  const result = await scrapeUrl(options.url, options.limit);
  const outDir = path.resolve(options.out ?? defaultArchiveDir(result));
  mkdirSync(outDir, { recursive: true });
  const scrapePath = path.join(outDir, "ads.json");
  const jsonlPath = path.join(outDir, "ads.jsonl");
  writeFileSync(scrapePath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(jsonlPath, `${renderJsonl(result)}\n`);

  const max = options.downloadLimit ?? "all";
  const guard = enforceLargeDownloadGuard(result, max, options.yes);
  if (guard) {
    process.stdout.write(
      `${JSON.stringify(
        {
          output_dir: outDir,
          scrape_file: scrapePath,
          jsonl_file: jsonlPath,
          ads: result.ads.length,
          needs_download_limit: true,
          message: guard,
          example: `npm --silent run meta-ads -- download-media ${scrapePath} --out ${outDir} --max 100`,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const downloadInput = limitScrapeResult(result, max);
  const manifest = await downloadMediaFromScrape(downloadInput, scrapePath, outDir, options.concurrency);
  process.stdout.write(
    `${JSON.stringify(
      {
        output_dir: outDir,
        scrape_file: scrapePath,
        jsonl_file: jsonlPath,
        gallery: path.join(outDir, "index.html"),
        manifest: path.join(outDir, "manifest.json"),
        counts: manifest.counts,
      },
      null,
      2,
    )}\n`,
  );
}

function renderMediaIndex(ads: DownloadedAd[], counts: Record<string, number>): string {
  const cards = ads
    .map((ad) => {
      const media = ad.video_file
        ? `<video src="${safeText(ad.video_file)}" controls preload="metadata" poster="${safeText(ad.preview_file)}"></video>`
        : ad.image_file
          ? `<img src="${safeText(ad.image_file)}" alt="">`
          : `<div class="missing">No local media</div>`;
      const errors = ad.errors.length ? `<p class="errors">${safeText(ad.errors.join("; "))}</p>` : "";
      return `<article class="ad">
  <div class="media">${media}</div>
  <div class="copy">
    <div class="meta"><span>${safeText(ad.display_format)}</span><a href="${safeText(ad.ad_library_url)}">Library ID ${safeText(ad.ad_archive_id)}</a></div>
    <h2>${safeText(ad.title) || "Untitled ad"}</h2>
    <p class="body">${safeText(ad.body_text)}</p>
    <p class="links">${safeText(ad.cta_text)} ${ad.link_url ? `- <a href="${safeText(ad.link_url)}">${safeText(ad.link_url)}</a>` : ""}</p>
    <p class="refs">Video: ${safeText(ad.video_file) || "none"}<br>Image: ${safeText(ad.image_file) || "none"}<br>Preview: ${safeText(ad.preview_file) || "none"}</p>
    ${errors}
  </div>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meta Ad Library Media Index</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f7f9;color:#17202a}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #d8dee8;padding:16px 24px;z-index:2}
h1{font-size:20px;margin:0 0 4px}
.summary{color:#526071;font-size:14px}
.grid{display:grid;gap:16px;padding:18px;max-width:1400px;margin:auto}
.ad{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:18px;background:#fff;border:1px solid #dfe5ee;border-radius:8px;padding:14px}
video,img{width:100%;max-height:520px;background:#111;border-radius:6px;object-fit:contain}
.meta{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#667085}
h2{font-size:18px;margin:10px 0 8px}
.body{white-space:pre-wrap;line-height:1.45}
.links,.refs{font-size:13px;color:#526071;word-break:break-word}
.errors{color:#a33;font-size:13px}
.missing{display:grid;place-items:center;min-height:220px;background:#edf1f7;border-radius:6px;color:#667085}
@media(max-width:800px){.ad{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <h1>Meta Ad Library Media Index</h1>
  <div class="summary">${counts.ads} ads - ${counts.videos} videos - ${counts.images} static images - ${counts.previews} previews - ${counts.errored_ads} ads with download errors</div>
</header>
<main class="grid">
${cards}
</main>
</body>
</html>
`;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function fixturePath(name: string): string {
  return path.join(process.cwd(), "skills", "meta-ad-library-scraper", "fixtures", name);
}

function runSelfTest() {
  const html = readFileSync(fixturePath("initial-page.html"), "utf8");
  const pagination = JSON.parse(readFileSync(fixturePath("pagination-response.json"), "utf8")) as {
    data: { ad_library_main: { search_results_connection: SearchConnection } };
  };
  const empty = readFileSync(fixturePath("empty-page.html"), "utf8");

  const connection = extractSearchConnection(html);
  const ads = rawAdsFromConnection(connection)
    .map((ad) => normalizeAd(ad, "2026-05-18T00:00:00.000Z"))
    .filter((ad): ad is NormalizedAd => ad !== null);

  assert(connection.count === 3, "initial fixture count should be 3");
  assert(ads.length === 3, "initial fixture should produce 3 ads");
  assert(ads[0]?.videos[0]?.video_hd_url, "video fixture should preserve video_hd_url");
  assert(ads[1]?.images[0]?.original_image_url, "image fixture should preserve original_image_url");
  assert((ads[2]?.cards.length ?? 0) === 1, "carousel fixture should preserve cards");
  assert(mediaSourcesForAd(ads[2] ?? ads[0])?.sourceImageUrl === "https://image.example/card.jpg", "carousel fixture should use card image as media source");
  assert(uniqueAdCount([...ads, ads[0] as NormalizedAd]) === ads.length, "unique ad count should ignore duplicate rows");
  assert(ads[0]?.body_text?.includes("Sleep better"), "text fixture should preserve body text");
  assert(extractSearchConnection(empty).count === 0, "empty fixture should parse count 0");

  const next = pagination.data.ad_library_main.search_results_connection;
  assert(rawAdsFromConnection(next).length === 1, "pagination fixture should parse one next-page ad");

  process.stdout.write("meta-ad-library-scraper self-test passed.\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "self-test") {
    runSelfTest();
    return;
  }
  if (args.command === "archive-url") {
    await archiveUrl(args);
    return;
  }
  if (args.command === "download-media") {
    await downloadMedia(args.input, args.out, args.max, args.yes, args.concurrency);
    return;
  }

  const result = await scrapeUrl(args.url, args.limit);
  process.stdout.write(args.format === "jsonl" ? `${renderJsonl(result)}\n` : `${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
