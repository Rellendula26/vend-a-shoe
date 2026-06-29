import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const templatePath = resolve(rootDir, "desktop-shell/index.html");
const outputDir = resolve(rootDir, "desktop-shell-build");
const outputPath = resolve(outputDir, "index.html");

const appUrl = (process.env.DESKTOP_APP_URL ?? "").trim();

const template = await readFile(templatePath, "utf8");
const html = template.replaceAll("__DESKTOP_APP_URL__", appUrl || "");

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, html, "utf8");

process.stdout.write(`Prepared desktop shell at ${outputPath}\n`);
