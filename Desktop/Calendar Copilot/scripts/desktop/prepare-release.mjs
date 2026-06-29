const requiredUpdaterEnv = ["TAURI_UPDATER_ENDPOINT", "TAURI_UPDATER_PUBKEY"];

const optionalSigningEnv = [
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_PROVIDER_SHORT_NAME",
  "WINDOWS_CERTIFICATE_THUMBPRINT",
  "WINDOWS_TIMESTAMP_URL",
];

const missingUpdater = requiredUpdaterEnv.filter((name) => !(process.env[name] ?? "").trim());
if (missingUpdater.length > 0) {
  process.stderr.write(
    `Missing required updater env for release: ${missingUpdater.join(", ")}.\n` +
      "Set these before producing signed update bundles.\n",
  );
  process.exit(1);
}

const unsetSigning = optionalSigningEnv.filter((name) => !(process.env[name] ?? "").trim());
if (unsetSigning.length > 0) {
  process.stdout.write(
    `Signing env not set (build still possible, signatures/notarization skipped): ${unsetSigning.join(", ")}\n`,
  );
}

process.stdout.write("Desktop release environment checks passed.\n");
