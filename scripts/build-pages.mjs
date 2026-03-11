import { mkdir, readdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const assets = ["index.html", "styles.css", "main.js", "gravity.js"];

await mkdir(distDir, { recursive: true });

for (const entry of await readdir(distDir)) {
  await rm(path.join(distDir, entry), { recursive: true, force: true });
}

for (const asset of assets) {
  await copyFile(path.join(rootDir, asset), path.join(distDir, asset));
}

const copiedAssets = await readdir(distDir);
console.log(`Built Pages bundle in ${distDir}`);
console.log(`Assets: ${copiedAssets.join(", ")}`);
