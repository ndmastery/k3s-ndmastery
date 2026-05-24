# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG PUBLIC_SITE_URL="https://web.formapper.com"
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ARG PUBLIC_SSO_URL="https://sso.ndmastery.com"
ENV PUBLIC_SSO_URL=$PUBLIC_SSO_URL
ARG PUBLIC_SSO_CLIENT_ID="formapper"
ENV PUBLIC_SSO_CLIENT_ID=$PUBLIC_SSO_CLIENT_ID
ARG PUBLIC_FORMAPPER_AUTOSAVE_INTERVAL_MS="300000"
ENV PUBLIC_FORMAPPER_AUTOSAVE_INTERVAL_MS=$PUBLIC_FORMAPPER_AUTOSAVE_INTERVAL_MS
ARG FORMAPPER_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/formapper"
ENV FORMAPPER_BACKEND_WS_URL=$FORMAPPER_BACKEND_WS_URL
ARG SSO_BACKEND_WS_URL="ws://server-ndmastery-stable.ndmastery.svc.cluster.local:4000/sso"
ENV SSO_BACKEND_WS_URL=$SSO_BACKEND_WS_URL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .
RUN bun run build.client && bun run build.server

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
LABEL org.opencontainers.image.title="client-formapper" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://web.formapper.com"
WORKDIR /app
ENV NODE_ENV=production \
    PROXY_PORT=3100 \
    APP_INTERNAL_PORT=13100 \
    APP_PROBE_PATH=/ \
    APP_SHUTDOWN_GRACE_MS=30000 \
    TMPDIR=/tmp
COPY images/runtime/node-health-proxy.mjs ./runtime/node-health-proxy.mjs
COPY --from=build --chown=nonroot:nonroot /app/build ./build
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
EXPOSE 3100
USER nonroot:nonroot
CMD ["runtime/node-health-proxy.mjs", "build/entry.node-server.js"]
