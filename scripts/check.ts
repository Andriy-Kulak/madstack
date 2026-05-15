import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];
const forbiddenCodexSkillPath = ["/Users", "andriykulak", ".codex", "skills"].join("/");

const skipDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".cache",
  ".tmp",
  "tmp",
  "local-media",
  "media",
  "outputs",
  "analysis-output",
  "generated",
]);

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".mp4",
  ".mov",
  ".webm",
  ".avi",
  ".m4v",
  ".wmv",
  ".flv",
  ".3gp",
  ".3gpp",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string): string {
  return path.relative(root, file);
}

function validateSkills() {
  const skillsRoot = path.join(root, "skills");
  const skillDirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  if (skillDirs.length === 0) failures.push("No skills found under skills/.");

  for (const entry of skillDirs) {
    const skillFile = path.join(skillsRoot, entry.name, "SKILL.md");
    try {
      const stat = statSync(skillFile);
      if (!stat.isFile()) failures.push(`${rel(skillFile)} is not a file.`);
    } catch {
      failures.push(`Missing ${rel(skillFile)}.`);
      continue;
    }

    const content = readFileSync(skillFile, "utf8");
    if (!content.startsWith("---\n")) failures.push(`${rel(skillFile)} must start with YAML frontmatter.`);
    if (!/^name:\s*\S+/m.test(content)) failures.push(`${rel(skillFile)} is missing frontmatter name.`);
    if (!/^description:\s*\S+/m.test(content)) failures.push(`${rel(skillFile)} is missing frontmatter description.`);
    if (!new RegExp(`^name:\\s*${entry.name}\\s*$`, "m").test(content)) {
      failures.push(`${rel(skillFile)} name should match directory name '${entry.name}'.`);
    }
  }
}

function scanTextFiles() {
  const googlePrefix = "AI" + "za";
  const openAiPrefix = "s" + "k-";
  const githubPrefix = "g" + "h";
  const falPrefix = "f" + "al-";
  const secretPatterns: Array<[string, RegExp]> = [
    ["Google API key", new RegExp(`${googlePrefix}[0-9A-Za-z_-]{35}`)],
    ["OpenAI-style API key", new RegExp(`\\b${openAiPrefix}[A-Za-z0-9_-]{20,}\\b`)],
    ["GitHub token", new RegExp(`\\b${githubPrefix}[pousr]_[A-Za-z0-9_]{20,}\\b`)],
    ["FAL key", new RegExp(`\\b${falPrefix}[A-Za-z0-9_-]{20,}\\b`)],
  ];

  for (const file of walk(root)) {
    if (binaryExtensions.has(path.extname(file).toLowerCase())) continue;
    const content = readFileSync(file, "utf8");

    if (content.includes(forbiddenCodexSkillPath)) {
      failures.push(`${rel(file)} contains a private local Codex skill path.`);
    }

    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(content)) failures.push(`${rel(file)} appears to contain a ${label}.`);
    }
  }
}

validateSkills();
scanTextFiles();

if (failures.length > 0) {
  console.error("madstack check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("madstack check passed.");
