#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const requireExisting = args.has("--require-existing");
const help = args.has("--help") || args.has("-h");
const baseArg = process.argv.find((arg) => arg.startsWith("--apps-base="));
const appsBase = baseArg ? baseArg.slice("--apps-base=".length) : "/opt/ndmastery/apps";

const vmDirectories = {
  "web-annajah": "client-annajah",
  "client-formapper": "client-register",
  "client-scorexam": "client-scorexam",
  "client-storagarage": "client-serveregistry",
  "server-ndmastery": "server-ndmastery",
  "web-curricanvas": "next-curricanvas",
  "web-calconversion": "web_calconversion",
  "client-sso": "web_sso",
  "client-curricanvas": "web_curricanvas-app",
};

if (help) {
  console.log(`usage: scripts/configure-vm-catalog-paths.mjs [--write] [--require-existing] [--apps-base=/opt/ndmastery/apps]

Updates catalog.json projectPath values to the standard Tencent VM layout.

By default this is a dry-run. Pass --write to update catalog.json.
Pass --require-existing to fail when an application directory is missing.`);
  process.exit(0);
}

const catalogPath = "catalog.json";
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const missingApps = [];
const missingPaths = [];

for (const app of catalog.apps) {
  const dir = vmDirectories[app.name];
  if (!dir) {
    missingApps.push(app.name);
    continue;
  }

  const nextPath = join(appsBase, dir);
  console.log(`${app.name}: ${app.projectPath} -> ${nextPath}`);
  app.projectPath = nextPath;

  if (requireExisting && !existsSync(nextPath)) {
    missingPaths.push(`${app.name}: ${nextPath}`);
  }
}

if (missingApps.length > 0) {
  console.error(`Missing VM directory mapping for: ${missingApps.join(", ")}`);
  process.exit(65);
}

if (missingPaths.length > 0) {
  console.error("Missing required application directories:");
  for (const item of missingPaths) console.error(`  ${item}`);
  process.exit(66);
}

if (write) {
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`wrote ${catalogPath}`);
} else {
  console.log("dry-run only; pass --write to update catalog.json");
}
