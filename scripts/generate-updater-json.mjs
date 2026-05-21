#!/usr/bin/env node
import fs from "node:fs/promises";

const [assetsPath = "release-assets.json", outputPath = "updater.json"] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;
const version = (process.env.RELEASE_VERSION || tag || "").replace(/^v/, "");

if (!repo) throw new Error("GITHUB_REPOSITORY is required");
if (!tag) throw new Error("GITHUB_REF_NAME is required");
if (!version) throw new Error("Release version is required");

const assets = JSON.parse(await fs.readFile(assetsPath, "utf8"));
if (!Array.isArray(assets)) throw new Error(`${assetsPath} must contain a GitHub release assets array`);

const assetByName = new Map(assets.map((asset) => [asset.name, asset]));
const platforms = {};

for (const asset of assets) {
  if (!asset.name.endsWith(".sig")) continue;
  const artifactName = asset.name.slice(0, -4);
  if (!assetByName.has(artifactName)) continue;

  const keys = platformKeysForArtifact(artifactName);
  if (keys.length === 0) continue;

  const signature = await fetchText(downloadUrl(asset.name));
  const entry = {
    signature: signature.trim(),
    url: downloadUrl(artifactName),
  };

  for (const key of keys) {
    if (!platforms[key]) platforms[key] = entry;
  }
}

const required = ["darwin-aarch64", "darwin-x86_64", "windows-x86_64", "linux-x86_64"];
const missing = required.filter((key) => !platforms[key]);
if (missing.length > 0) {
  throw new Error(`Missing updater assets for: ${missing.join(", ")}. Make sure release assets include signed updater bundles and .sig files.`);
}

const manifest = {
  version,
  notes: `Camo ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${outputPath} with platforms: ${Object.keys(platforms).sort().join(", ")}`);

function downloadUrl(name) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

async function fetchText(url) {
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function platformKeysForArtifact(name) {
  const lower = name.toLowerCase();
  const keys = [];

  if (isMacArtifact(lower)) {
    if (lower.includes("aarch64") || lower.includes("arm64")) {
      keys.push("darwin-aarch64-app", "darwin-aarch64");
    } else if (lower.includes("x86_64") || lower.includes("x64")) {
      keys.push("darwin-x86_64-app", "darwin-x86_64");
    }
    return keys;
  }

  if (isWindowsArtifact(lower)) {
    if (lower.includes("aarch64") || lower.includes("arm64")) {
      keys.push("windows-aarch64");
    } else {
      if (lower.includes("msi")) keys.push("windows-x86_64-msi");
      if (lower.includes("nsis") || lower.includes("setup") || lower.endsWith(".exe.zip")) keys.push("windows-x86_64-nsis");
      keys.push("windows-x86_64");
    }
    return keys;
  }

  if (isLinuxArtifact(lower)) {
    if (lower.includes("aarch64") || lower.includes("arm64")) {
      keys.push("linux-aarch64");
    } else {
      if (lower.includes("appimage")) keys.push("linux-x86_64-appimage");
      if (lower.includes(".deb")) keys.push("linux-x86_64-deb");
      if (lower.includes(".rpm")) keys.push("linux-x86_64-rpm");
      keys.push("linux-x86_64");
    }
  }

  return keys;
}

function isMacArtifact(lower) {
  return lower.includes(".app.tar.gz") || lower.endsWith(".dmg") || lower.includes("darwin") || lower.includes("apple-darwin");
}

function isWindowsArtifact(lower) {
  return lower.includes("windows") || lower.includes(".msi") || lower.includes(".exe") || lower.includes("nsis");
}

function isLinuxArtifact(lower) {
  return lower.includes("linux") || lower.includes("appimage") || lower.includes(".deb") || lower.includes(".rpm");
}
