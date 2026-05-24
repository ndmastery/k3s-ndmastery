#!/usr/bin/env node
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const [entry, ...entryArgs] = process.argv.slice(2);
if (!entry) {
  console.error("Missing app entrypoint argument");
  process.exit(64);
}

const proxyPort = Number.parseInt(process.env.PROXY_PORT || process.env.PORT || "3000", 10);
const internalPort = Number.parseInt(process.env.APP_INTERNAL_PORT || String(proxyPort + 10000), 10);
const probePath = process.env.APP_PROBE_PATH || "/";
const shutdownGraceMs = Number.parseInt(process.env.APP_SHUTDOWN_GRACE_MS || "30000", 10);
let draining = false;
let active = 0;

const child = spawn(process.execPath, [entry, ...entryArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(internalPort),
    HOST: "127.0.0.1",
  },
});

child.on("exit", (code, signal) => {
  if (!draining) {
    console.error(`child exited unexpectedly code=${code} signal=${signal}`);
    process.exit(code ?? 1);
  }
});

async function probeInternal() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: internalPort,
        path: probePath,
        method: "GET",
        timeout: 1500,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/drainz") {
    draining = true;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "draining" }));
    try {
      server.close();
    } catch {}
    return;
  }

  if (req.url === "/healthz") {
    res.writeHead(child.exitCode == null ? 200 : 500, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: child.exitCode == null ? "ok" : "failed" }));
    return;
  }

  if (req.url === "/readyz") {
    const ready = !draining && child.exitCode == null && (await probeInternal());
    res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: ready ? "ready" : "draining" }));
    return;
  }

  if (draining) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("draining");
    return;
  }

  active += 1;
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: internalPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("bad gateway");
  });
  res.on("close", () => {
    active = Math.max(0, active - 1);
  });
  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  if (draining) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  active += 1;
  const upstream = net.connect(internalPort, "127.0.0.1", () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) upstream.write(`${key}: ${item}\r\n`);
      } else if (value != null) {
        upstream.write(`${key}: ${value}\r\n`);
      }
    }
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const done = () => {
    active = Math.max(0, active - 1);
  };
  socket.on("close", done);
  upstream.on("error", () => socket.destroy());
});

server.listen(proxyPort, "0.0.0.0", () => {
  console.log(`health proxy listening on 0.0.0.0:${proxyPort}, app on 127.0.0.1:${internalPort}`);
});

function shutdown(signal) {
  if (draining) return;
  draining = true;
  console.log(`received ${signal}; draining`);
  try {
    server.close();
  } catch {}
  const started = Date.now();
  const timer = setInterval(() => {
    if (active === 0 || Date.now() - started >= shutdownGraceMs) {
      clearInterval(timer);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }
  }, 250);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
