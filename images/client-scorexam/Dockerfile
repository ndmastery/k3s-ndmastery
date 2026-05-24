# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG PUBLIC_SITE_URL="https://web.scorexam.com"
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ARG PUBLIC_SSO_URL="https://sso.ndmastery.com"
ENV PUBLIC_SSO_URL=$PUBLIC_SSO_URL
ARG PUBLIC_SSO_CLIENT_ID="scorexam"
ENV PUBLIC_SSO_CLIENT_ID=$PUBLIC_SSO_CLIENT_ID
ARG SSO_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/sso"
ENV SSO_BACKEND_WS_URL=$SSO_BACKEND_WS_URL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .
RUN bun run build.client && bun run build.server

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
LABEL org.opencontainers.image.title="client-scorexam" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://web.scorexam.com"
WORKDIR /app
ENV NODE_ENV=production \
    PROXY_PORT=3101 \
    APP_INTERNAL_PORT=13101 \
    APP_PROBE_PATH=/ \
    APP_SHUTDOWN_GRACE_MS=30000 \
    TMPDIR=/tmp
COPY images/runtime/node-health-proxy.mjs ./runtime/node-health-proxy.mjs
COPY --from=build --chown=nonroot:nonroot /app/build ./build
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
EXPOSE 3101
USER nonroot:nonroot
CMD ["runtime/node-health-proxy.mjs", "build/entry.node-server.js"]
