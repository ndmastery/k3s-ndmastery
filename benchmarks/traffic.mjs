#!/usr/bin/env node
import { performance } from "node:perf_hooks";

const url = process.argv[2];
const durationSeconds = Number.parseInt(process.env.DURATION_SECONDS || "30", 10);
const concurrency = Number.parseInt(process.env.CONCURRENCY || "16", 10);
if (!url) {
  console.error("usage: traffic.mjs <url>");
  process.exit(64);
}

const endAt = Date.now() + durationSeconds * 1000;
const latencyMs = [];
let requests = 0;
let errors = 0;

async function worker() {
  while (Date.now() < endAt) {
    const start = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual" });
      await res.arrayBuffer();
      if (res.status >= 500) errors += 1;
    } catch {
      errors += 1;
    } finally {
      latencyMs.push(performance.now() - start);
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
process.stdout.write(JSON.stringify({ url, durationSeconds, concurrency, requests, errors, latencyMs }, null, 2));
