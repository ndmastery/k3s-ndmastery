# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG PUBLIC_APP_URL="https://web.curricanvas.com"
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL
ARG PUBLIC_SSO_URL="https://sso.ndmastery.com"
ENV PUBLIC_SSO_URL=$PUBLIC_SSO_URL
ARG PUBLIC_SSO_CLIENT_ID="curricanvas"
ENV PUBLIC_SSO_CLIENT_ID=$PUBLIC_SSO_CLIENT_ID
ARG PUBLIC_BACKEND_WS_URL="wss://server.ndmastery.com"
ENV PUBLIC_BACKEND_WS_URL=$PUBLIC_BACKEND_WS_URL
ARG SSO_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/sso"
ENV SSO_BACKEND_WS_URL=$SSO_BACKEND_WS_URL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .
RUN bun run build

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
LABEL org.opencontainers.image.title="client-curricanvas" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://web.curricanvas.com"
WORKDIR /app
ENV NODE_ENV=production \
    PROXY_PORT=3104 \
    APP_INTERNAL_PORT=13104 \
    APP_PROBE_PATH=/ \
    APP_SHUTDOWN_GRACE_MS=30000 \
    TMPDIR=/tmp
COPY images/runtime/node-health-proxy.mjs ./runtime/node-health-proxy.mjs
COPY --from=build --chown=nonroot:nonroot /app/build ./build
COPY --from=build --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
EXPOSE 3104
USER nonroot:nonroot
CMD ["runtime/node-health-proxy.mjs", "build/index.js"]
