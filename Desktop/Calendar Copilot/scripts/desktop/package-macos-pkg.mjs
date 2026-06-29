import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appName = "Calendar Copilot.app";
const bundleDir = resolve(process.cwd(), "src-tauri/target/release/bundle/macos");
const appPath = resolve(bundleDir, appName);
const outputPkg = resolve(bundleDir, "CalendarCopilot.pkg");

if (!existsSync(appPath)) {
  process.stderr.write(`Missing app bundle at ${appPath}. Run npm run desktop:release:mac first.\n`);
  process.exit(1);
}

const pkgbuild = spawnSync(
  "pkgbuild",
  [
    "--component",
    appPath,
    "--install-location",
    "/Applications",
    "--identifier",
    "com.calendarcopilot.desktop.pkg",
    outputPkg,
  ],
  { stdio: "inherit" },
);

if (pkgbuild.status !== 0) {
  process.exit(pkgbuild.status ?? 1);
}

process.stdout.write(`Created macOS pkg installer at ${outputPkg}\n`);
