import { spawnSync } from "node:child_process";

const target = process.argv[2];

const matrix = {
  mac: {
    bundles: "app,dmg,updater",
  },
  windows: {
    bundles: "nsis,updater",
    target: "x86_64-pc-windows-msvc",
  },
  linux: {
    bundles: "appimage,deb,rpm,updater",
    target: "x86_64-unknown-linux-gnu",
  },
};

if (!target || !(target in matrix)) {
  process.stderr.write("Usage: node scripts/desktop/release.mjs <mac|windows|linux>\n");
  process.exit(1);
}

const selected = matrix[target];

const prep = spawnSync("node", ["scripts/desktop/prepare-release.mjs"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (prep.status !== 0) {
  process.exit(prep.status ?? 1);
}

const args = ["tauri", "build", "--bundles", selected.bundles];
if (selected.target) {
  args.push("--target", selected.target);
}

const build = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(build.status ?? 1);
