#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const catalog = JSON.parse(readFileSync("catalog.json", "utf8"));
const imageTagArg = process.argv.find((arg) => arg.startsWith("--image-tag="));
const defaultImageTag = imageTagArg ? imageTagArg.split("=")[1] : null;
const cpuHeadroom = Number.parseFloat(process.env.CPU_HEADROOM || "0.75");
const memoryHeadroom = Number.parseFloat(process.env.MEMORY_HEADROOM || "0.75");

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("empty measurement array");
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function ceilTo(value, step) {
  return Math.max(step, Math.ceil(value / step) * step);
}

function cpu(milli) {
  return `${Math.ceil(milli)}m`;
}

function mem(mi) {
  return `${Math.ceil(mi)}Mi`;
}

function labels(app) {
  return `app.kubernetes.io/name: ${app.name}
        app.kubernetes.io/part-of: ndmastery`;
}

function loadResult(app) {
  const file = join("benchmarks", "results", `${app.name}.json`);
  if (!existsSync(file)) throw new Error(`missing benchmark result: ${file}`);
  const result = JSON.parse(readFileSync(file, "utf8"));
  if (result.app !== app.name) throw new Error(`${file} belongs to ${result.app}, expected ${app.name}`);
  return result;
}

function derive(app, result) {
  const steadyCpuP95 = percentile(result.measurements.steady.cpuMilli, 95);
  const spikeCpuP99 = percentile(result.measurements.spike.cpuMilli, 99);
  const steadyMemP95 = percentile(result.measurements.steady.memoryMi, 95);
  const spikeMemP99 = percentile(result.measurements.spike.memoryMi, 99);
  const startupP99 = percentile(result.measurements.startupSeconds, 99);
  const latencyP99 = percentile([...result.measurements.steady.latencyMs, ...result.measurements.spike.latencyMs], 99);
  const drainP99 = percentile(result.measurements.drainSeconds, 99);

  const cpuRequest = ceilTo(steadyCpuP95 * 1.25, 5);
  const cpuLimit = Math.max(ceilTo(spikeCpuP99 * 1.5, 10), cpuRequest + 10);
  const memoryRequest = ceilTo(steadyMemP95 * 1.25, 8);
  const memoryLimit = Math.max(ceilTo(spikeMemP99 * 1.5, 16), memoryRequest + 16);
  const startupBudget = Math.ceil(startupP99 * 1.25);
  const terminationGrace = Math.max(15, Math.ceil(drainP99 * 1.5) + 5);
  const minReadySeconds = Math.max(5, Math.ceil(Math.min(60, latencyP99 / 100)));
  const progressDeadlineSeconds = Math.max(120, startupBudget * 3 + terminationGrace * 2);

  return {
    imageTag: defaultImageTag || result.imageTag,
    cpuRequest,
    cpuLimit,
    memoryRequest,
    memoryLimit,
    startupFailureThreshold: Math.max(3, Math.ceil(startupBudget / 2)),
    readinessTimeoutSeconds: Math.max(2, Math.ceil(Math.min(10, latencyP99 / 1000 + 1))),
    livenessFailureThreshold: 3,
    terminationGrace,
    minReadySeconds,
    progressDeadlineSeconds,
    pause10: Math.max(15, minReadySeconds * 2),
    pause50: Math.max(30, minReadySeconds * 3),
    pause100: Math.max(30, minReadySeconds * 3),
    cpuTargetUtilization: Math.max(50, Math.min(75, Math.round((steadyCpuP95 / cpuRequest) * 100))),
    memoryTargetUtilization: Math.max(50, Math.min(80, Math.round((steadyMemP95 / memoryRequest) * 100))),
  };
}

function analysisTemplate(app, d) {
  return `
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: ${app.name}-smoke
  namespace: ndmastery
  labels:
    app.kubernetes.io/name: ${app.name}
    app.kubernetes.io/component: rollout-analysis
spec:
  metrics:
    - name: canary-http-smoke
      count: 3
      interval: 5s
      failureLimit: 1
      provider:
        job:
          spec:
            backoffLimit: 0
            activeDeadlineSeconds: ${Math.max(20, d.readinessTimeoutSeconds * 6)}
            template:
              metadata:
                labels:
                  app.kubernetes.io/component: rollout-analysis
              spec:
                restartPolicy: Never
                securityContext:
                  runAsNonRoot: true
                  runAsUser: 65534
                  runAsGroup: 65534
                  seccompProfile:
                    type: RuntimeDefault
                containers:
                  - name: smoke
                    image: curlimages/curl:8.17.0
                    args:
                      - --fail
                      - --silent
                      - --show-error
                      - --max-time
                      - "${d.readinessTimeoutSeconds}"
                      - "http://${app.name}-canary.ndmastery.svc.cluster.local:${app.port}/readyz"
                    securityContext:
                      allowPrivilegeEscalation: false
                      readOnlyRootFilesystem: true
                      capabilities:
                        drop:
                          - ALL
                    resources:
                      requests:
                        cpu: 10m
                        memory: 16Mi
                      limits:
                        cpu: 50m
                        memory: 32Mi
`;
}

function rollout(app, d) {
  const image = `${catalog.registry}/${app.name}:${d.imageTag}`;
  const runtimeEnv = app.runtime === "zig-gateway" ? "" : `
            - name: PROXY_PORT
              value: "${app.port}"
            - name: APP_INTERNAL_PORT
              value: "${app.port + 10000}"
            - name: APP_PROBE_PATH
              value: "${app.healthPath}"
            - name: APP_SHUTDOWN_GRACE_MS
              value: "${d.terminationGrace * 1000}"`;
  const secretRef = app.secretKeys?.length ? `
            - secretRef:
                name: ${app.name}-secret` : "";
  const lifecycle = app.runtime === "static-qwik" || app.runtime === "static-qwik-vercel"
    ? `
          lifecycle:
            preStop:
              exec:
                command:
                  - /usr/sbin/nginx
                  - -s
                  - quit`
    : app.runtime === "zig-gateway"
      ? ""
      : `
          lifecycle:
            preStop:
              httpGet:
                path: /drainz
                port: http`;
  return `
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: ${app.name}
  namespace: ndmastery
  labels:
    app.kubernetes.io/name: ${app.name}
    app.kubernetes.io/part-of: ndmastery
spec:
  replicas: 2
  revisionHistoryLimit: 5
  progressDeadlineSeconds: ${d.progressDeadlineSeconds}
  minReadySeconds: ${d.minReadySeconds}
  selector:
    matchLabels:
      app.kubernetes.io/name: ${app.name}
  strategy:
    canary:
      stableService: ${app.name}-stable
      canaryService: ${app.name}-canary
      maxSurge: 1
      maxUnavailable: 0
      trafficRouting:
        traefik:
          weightedTraefikServiceName: ${app.name}-wrr
      steps:
        - setWeight: 0
        - analysis:
            templates:
              - templateName: ${app.name}-smoke
        - setWeight: 10
        - pause:
            duration: ${d.pause10}s
        - analysis:
            templates:
              - templateName: ${app.name}-smoke
        - setWeight: 50
        - pause:
            duration: ${d.pause50}s
        - analysis:
            templates:
              - templateName: ${app.name}-smoke
        - setWeight: 100
        - pause:
            duration: ${d.pause100}s
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${app.name}
        app.kubernetes.io/part-of: ndmastery
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: ${d.terminationGrace}
      securityContext:
        runAsNonRoot: true
        runAsUser: ${app.runtime === "static-qwik" || app.runtime === "static-qwik-vercel" ? 10001 : 65534}
        runAsGroup: ${app.runtime === "static-qwik" || app.runtime === "static-qwik-vercel" ? 10001 : 65534}
        fsGroup: ${app.runtime === "static-qwik" || app.runtime === "static-qwik-vercel" ? 10001 : 65534}
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: ${image}
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: ${app.port}
              protocol: TCP
          envFrom:
            - configMapRef:
                name: ${app.name}-config${secretRef}
          env:${runtimeEnv || `
            - name: GATEWAY_PORT
              value: "${app.port}"`}
          startupProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 2
            timeoutSeconds: ${d.readinessTimeoutSeconds}
            failureThreshold: ${d.startupFailureThreshold}
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 5
            timeoutSeconds: ${d.readinessTimeoutSeconds}
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
            timeoutSeconds: ${d.readinessTimeoutSeconds}
            failureThreshold: ${d.livenessFailureThreshold}
${lifecycle}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: ${cpu(d.cpuRequest)}
              memory: ${mem(d.memoryRequest)}
            limits:
              cpu: ${cpu(d.cpuLimit)}
              memory: ${mem(d.memoryLimit)}
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: cache
              mountPath: /var/cache/nginx
      volumes:
        - name: tmp
          emptyDir:
            medium: Memory
        - name: cache
          emptyDir:
            medium: Memory
`;
}

function hpa(app, d, maxReplicas) {
  return `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${app.name}
  namespace: ndmastery
  labels:
    app.kubernetes.io/name: ${app.name}
spec:
  scaleTargetRef:
    apiVersion: argoproj.io/v1alpha1
    kind: Rollout
    name: ${app.name}
  minReplicas: 2
  maxReplicas: ${maxReplicas}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 1
          periodSeconds: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: ${d.cpuTargetUtilization}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: ${d.memoryTargetUtilization}
`;
}

const derived = [];
for (const app of catalog.apps) {
  const result = loadResult(app);
  derived.push({ app, result, d: derive(app, result) });
}

const nodeCpu = Math.min(...derived.map((item) => item.result.node.cpuMilli));
const nodeMem = Math.min(...derived.map((item) => item.result.node.memoryMi));
const cpuBudget = nodeCpu * cpuHeadroom;
const memBudget = nodeMem * memoryHeadroom;
const baseCpu = derived.reduce((sum, item) => sum + item.d.cpuRequest * 2, 0);
const baseMem = derived.reduce((sum, item) => sum + item.d.memoryRequest * 2, 0);
if (baseCpu > cpuBudget || baseMem > memBudget) {
  const lines = derived
    .map((item) => `${item.app.name}: 2 pods require ${Math.ceil(item.d.cpuRequest * 2)}m CPU, ${Math.ceil(item.d.memoryRequest * 2)}Mi memory`)
    .join("\n");
  throw new Error(`Measured two-pod baseline exceeds safe node budget.\nBudget: ${Math.floor(cpuBudget)}m CPU, ${Math.floor(memBudget)}Mi memory\n${lines}`);
}

const remainingCpu = Math.max(0, cpuBudget - baseCpu);
const remainingMem = Math.max(0, memBudget - baseMem);
const maxReplicasByApp = new Map();
for (const item of derived) {
  const byCpu = Math.floor(2 + remainingCpu / item.d.cpuRequest);
  const byMem = Math.floor(2 + remainingMem / item.d.memoryRequest);
  maxReplicasByApp.set(item.app.name, Math.max(2, Math.min(byCpu, byMem, 10)));
}

for (const { app, d } of derived) {
  const dir = join("apps", app.name, "generated");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "analysis-template.yaml"), analysisTemplate(app, d).trimStart());
  writeFileSync(join(dir, "rollout.yaml"), rollout(app, d).trimStart());
  writeFileSync(join(dir, "hpa.yaml"), hpa(app, d, maxReplicasByApp.get(app.name)).trimStart());
}

mkdirSync("platform/generated", { recursive: true });
writeFileSync("platform/generated/resource-policy.yaml", `
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ndmastery-measured-capacity
  namespace: ndmastery
spec:
  hard:
    requests.cpu: "${Math.floor(cpuBudget)}m"
    requests.memory: "${Math.floor(memBudget)}Mi"
    limits.cpu: "${Math.floor(nodeCpu)}m"
    limits.memory: "${Math.floor(nodeMem * 0.9)}Mi"
    pods: "${derived.reduce((sum, item) => sum + maxReplicasByApp.get(item.app.name), 0) + 8}"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: ndmastery-measured-container-bounds
  namespace: ndmastery
spec:
  limits:
    - type: Container
      min:
        cpu: "${cpu(Math.min(...derived.map((item) => item.d.cpuRequest)))}"
        memory: "${mem(Math.min(...derived.map((item) => item.d.memoryRequest)))}"
      max:
        cpu: "${cpu(Math.max(...derived.map((item) => item.d.cpuLimit)))}"
        memory: "${mem(Math.max(...derived.map((item) => item.d.memoryLimit)))}"
`.trimStart());

console.log("generated benchmark-derived manifests");
