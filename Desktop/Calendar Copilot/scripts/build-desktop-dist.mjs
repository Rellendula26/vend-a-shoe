import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = resolve(fileURLToPath(new URL("../", import.meta.url)));
const outputDir = resolve(rootDir, "desktop-dist");
const nextAppHtml = resolve(rootDir, ".next/server/app/index.html");
const nextStaticDir = resolve(rootDir, ".next/static");
const publicDir = resolve(rootDir, "public");

await mkdir(outputDir, { recursive: true });
await cp(nextAppHtml, resolve(outputDir, "index.html"));
await cp(nextStaticDir, resolve(outputDir, "_next/static"), { recursive: true });
try {
  await cp(publicDir, outputDir, { recursive: true });
} catch {
  // No public directory in this project.
}

process.stdout.write(`Prepared desktop bundle at ${outputDir}\n`);
