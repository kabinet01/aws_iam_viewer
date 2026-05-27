import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

const GITHUB_API = "https://api.github.com/repos/DataDog/pathfinding.cloud/contents/data/paths";
const RAW_BASE = "https://raw.githubusercontent.com/DataDog/pathfinding.cloud/main/data/paths";

interface PrivescPath {
  id: string;
  name: string;
  category: string;
  services: string[];
  description: string;
  permissions: {
    required?: Array<{ permission: string; resourceConstraints?: string }>;
    additional?: Array<{ permission: string; resourceConstraints?: string }>;
  };
  recommendation: string;
  references: Array<{ title: string; url: string }>;
  relatedPaths: string[];
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "aws-iam-viewer-data-script",
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "aws-iam-viewer-data-script" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractFields(raw: Record<string, unknown>): PrivescPath {
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    category: String(raw.category || ""),
    services: Array.isArray(raw.services) ? raw.services.map(String) : [],
    description: String(raw.description || ""),
    permissions: extractPermissions(raw.permissions),
    recommendation: String(raw.recommendation || ""),
    references: extractReferences(raw.references),
    relatedPaths: Array.isArray(raw.relatedPaths) ? raw.relatedPaths.map(String) : [],
  };
}

function extractPermissions(perms: unknown): PrivescPath["permissions"] {
  const p = perms as Record<string, unknown> | undefined;
  if (!p) return {};
  const result: PrivescPath["permissions"] = {};

  if (Array.isArray(p.required)) {
    result.required = p.required.map((r: Record<string, unknown>) => ({
      permission: String(r.permission || ""),
      resourceConstraints: r.resourceConstraints ? String(r.resourceConstraints) : undefined,
    }));
  }
  if (Array.isArray(p.additional)) {
    result.additional = p.additional.map((r: Record<string, unknown>) => ({
      permission: String(r.permission || ""),
      resourceConstraints: r.resourceConstraints ? String(r.resourceConstraints) : undefined,
    }));
  }
  return result;
}

function extractReferences(refs: unknown): PrivescPath["references"] {
  if (!Array.isArray(refs)) return [];
  return refs.map((r: Record<string, unknown>) => ({
    title: String(r.title || ""),
    url: String(r.url || ""),
  }));
}

async function main() {
  console.log("Fetching service directories from GitHub...");
  const services = (await fetchJson(GITHUB_API)) as Array<{ name: string; type: string }>;

  const allPaths: PrivescPath[] = [];

  for (const service of services) {
    if (service.type !== "dir") continue;
    console.log(`  Processing service: ${service.name}`);

    const files = (await fetchJson(
      `https://api.github.com/repos/DataDog/pathfinding.cloud/contents/data/paths/${service.name}`
    )) as Array<{ name: string; type: string; download_url: string }>;

    for (const file of files) {
      if (file.type !== "file" || !file.name.endsWith(".yaml")) continue;

      const yamlText = await fetchText(
        `${RAW_BASE}/${service.name}/${file.name}`
      );
      const parsed = yaml.load(yamlText) as Record<string, unknown>;
      allPaths.push(extractFields(parsed));
    }
  }

  const outputPath = path.resolve(
    __dirname,
    "..",
    "src",
    "data",
    "privesc-paths.json"
  );

  fs.writeFileSync(outputPath, JSON.stringify(allPaths, null, 2));
  console.log(`\nDone! ${allPaths.length} paths written to ${outputPath}`);

  // Summary by category
  const byCategory: Record<string, number> = {};
  for (const p of allPaths) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }
  console.log("\nPaths by category:");
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
