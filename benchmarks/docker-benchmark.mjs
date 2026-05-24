#!/usr/bin/env node
import { cpus, totalmem } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync("catalog.json", "utf8")));
const appName = process.argv[2];
const app = catalog.apps.find((item) => item.name === appName);
if (!app) {
  console.error("usage: docker-benchmark.mjs <app-name>");
  process.exit(64);
}

const imageTag = process.env.IMAGE_TAG || gitSha(app.projectPath) || "manual";
const image = `${catalog.registry}/${app.name}:${imageTag}`;
const hostPort = String(app.port + 20000);
const baseUrl = `http://127.0.0.1:${hostPort}`;
const resultPath = `benchmarks/results/${app.name}.json`;
mkdirSync("benchmarks/results", { recursive: true });

function gitSha(cwd) {
  const res = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

function run(args, opts = {}) {
  const res = spawnSync(args[0], args.slice(1), { encoding: "utf8", ...opts });
  if (res.status !== 0) throw new Error(`${args.join(" ")} failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

function removeContainer(name) {
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}

async function waitReady(name) {
  const start = performance.now();
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/readyz`, { redirect: "manual" });
      if (res.status >= 200 && res.status < 400) return (performance.now() - start) / 1000;
    } catch {}
    if ((performance.now() - start) > 120000) {
      const logs = spawnSync("docker", ["logs", name], { encoding: "utf8" });
      throw new Error(`readiness timeout for ${name}\n${logs.stdout}\n${logs.stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function startContainer(sample) {
  const name = `bench-${app.name}-${sample}`;
  removeContainer(name);
  const args = [
    "run", "-d", "--name", name,
    "-p", `127.0.0.1:${hostPort}:${app.port}`,
    "-e", `PROXY_PORT=${app.port}`,
    "-e", `APP_SHUTDOWN_GRACE_MS=30000`,
    image,
  ];
  for (const [key, value] of Object.entries(app.publicEnv || {})) {
    args.splice(args.length - 1, 0, "-e", `${key}=${value}`);
  }
  run(["docker", ...args]);
  return name;
}

function parseBytes(value) {
  const [number, unit] = value.trim().split(/\s+/);
  const n = Number.parseFloat(number);
  if (/GiB/i.test(unit)) return n * 1024;
  if (/MiB/i.test(unit)) return n;
  if (/KiB/i.test(unit)) return n / 1024;
  if (/GB/i.test(unit)) return n * 953.674;
  if (/MB/i.test(unit)) return n * 0.953674;
  return n / 1024 / 1024;
}

function dockerStats(name) {
  const out = run(["docker", "stats", "--no-stream", "--format", "{{json .}}", name]);
  const stat = JSON.parse(out);
  const cpuPercent = Number.parseFloat(String(stat.CPUPerc).replace("%", ""));
  const memUsage = String(stat.MemUsage).split("/")[0].trim();
  return {
    cpuMilli: (cpuPercent / 100) * cpus().length * 1000,
    memoryMi: parseBytes(memUsage),
  };
}

async function collectTraffic(name, label, durationSeconds, concurrency) {
  const stats = [];
  const timer = setInterval(() => {
    try { stats.push(dockerStats(name)); } catch {}
  }, 1000);
  const res = spawnSync(process.execPath, ["benchmarks/traffic.mjs", `${baseUrl}${app.healthPath === "/healthz" ? "/" : app.healthPath}`], {
    env: { ...process.env, DURATION_SECONDS: String(durationSeconds), CONCURRENCY: String(concurrency) },
    encoding: "utf8",
  });
  clearInterval(timer);
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  const traffic = JSON.parse(res.stdout);
  return {
    label,
    cpuMilli: stats.map((item) => item.cpuMilli),
    memoryMi: stats.map((item) => item.memoryMi),
    latencyMs: traffic.latencyMs,
    requests: traffic.requests,
    errors: traffic.errors,
    concurrency,
    durationSeconds,
  };
}

const startupSeconds = [];
const startupSamples = Number.parseInt(process.env.STARTUP_SAMPLES || "7", 10);
for (let i = 0; i < startupSamples; i += 1) {
  const name = startContainer(`startup-${i}`);
  startupSeconds.push(await waitReady(name));
  removeContainer(name);
}

const name = startContainer("load");
await waitReady(name);
const steady = await collectTraffic(name, "steady", Number.parseInt(process.env.STEADY_SECONDS || "45", 10), Number.parseInt(process.env.STEADY_CONCURRENCY || "16", 10));
const spike = await collectTraffic(name, "spike", Number.parseInt(process.env.SPIKE_SECONDS || "30", 10), Number.parseInt(process.env.SPIKE_CONCURRENCY || "64", 10));
const drainStart = performance.now();
spawnSync("docker", ["stop", "--time", "60", name], { encoding: "utf8" });
const drainSeconds = [(performance.now() - drainStart) / 1000];
removeContainer(name);

writeFileSync(resultPath, JSON.stringify({
  app: app.name,
  image,
  imageTag,
  generatedAt: new Date().toISOString(),
  node: {
    cpuMilli: cpus().length * 1000,
    memoryMi: totalmem() / 1024 / 1024,
  },
  measurements: {
    startupSeconds,
    steady,
    spike,
    drainSeconds,
  },
}, null, 2));

console.log(`wrote ${resultPath}`);
