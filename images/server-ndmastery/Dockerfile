# syntax=docker/dockerfile:1.7
FROM ghcr.io/ziglang/zig:0.16.0 AS build
WORKDIR /src
COPY --from=app . .
RUN zig build -Doptimize=ReleaseFast

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
LABEL org.opencontainers.image.title="server-ndmastery" \
      org.opencontainers.image.vendor="ndmastery" \
      org.opencontainers.image.url="https://server.ndmastery.com"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /src/zig-out/bin/server-ndmastery /app/server-ndmastery
ENV GATEWAY_PORT=4000
EXPOSE 4000
USER nonroot:nonroot
CMD ["/app/server-ndmastery"]
