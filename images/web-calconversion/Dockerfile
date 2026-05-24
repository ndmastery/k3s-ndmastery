# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG PUBLIC_SITE_URL="https://calconversion.com"
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ARG PUBLIC_CONTACT_EMAIL="support@calconversion.com"
ENV PUBLIC_CONTACT_EMAIL=$PUBLIC_CONTACT_EMAIL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .
RUN bun run build.vercel

FROM nginx:1.27-alpine-slim AS runtime
ARG APP_PORT=3003
LABEL org.opencontainers.image.title="web-calconversion" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://calconversion.com"
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*
COPY images/runtime/nginx-static.conf /etc/nginx/nginx.conf
RUN sed -i "s/__APP_PORT__/3003/g" /etc/nginx/nginx.conf && \
    mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi /var/cache/nginx && \
    chown -R 10001:10001 /tmp/nginx-* /var/cache/nginx /var/log/nginx /usr/share/nginx/html && \
    touch /tmp/nginx.pid && chown 10001:10001 /tmp/nginx.pid
COPY --from=build --chown=10001:10001 /app/.vercel/output/static/ /usr/share/nginx/html/
USER 10001:10001
EXPOSE 3003
CMD ["nginx", "-g", "daemon off;"]
