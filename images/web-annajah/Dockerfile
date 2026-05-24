# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG VITE_CLIENT_PORT="3001"
ENV VITE_CLIENT_PORT=$VITE_CLIENT_PORT
ARG VITE_COMPANY_URL="https://annajahfoundation.sch.id"
ENV VITE_COMPANY_URL=$VITE_COMPANY_URL
ARG VITE_SITE_URL="https://annajahfoundation.sch.id"
ENV VITE_SITE_URL=$VITE_SITE_URL
ARG VITE_SSO_URL="https://sso.ndmastery.com"
ENV VITE_SSO_URL=$VITE_SSO_URL
COPY --from=app package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --from=app . .
RUN bun run build

FROM nginx:1.27-alpine-slim AS runtime
ARG APP_PORT=3001
LABEL org.opencontainers.image.title="web-annajah" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://annajahfoundation.sch.id"
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*
COPY images/runtime/nginx-static.conf /etc/nginx/nginx.conf
RUN sed -i "s/__APP_PORT__/3001/g" /etc/nginx/nginx.conf && \
    mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi /var/cache/nginx && \
    chown -R 10001:10001 /tmp/nginx-* /var/cache/nginx /var/log/nginx /usr/share/nginx/html && \
    touch /tmp/nginx.pid && chown 10001:10001 /tmp/nginx.pid
COPY --from=build --chown=10001:10001 /app/build/ /usr/share/nginx/html/
USER 10001:10001
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
