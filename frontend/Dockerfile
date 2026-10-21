# VanDrishti web image: the built console served by Caddy, which also proxies /api.
#   docker build -t vandrishti/web:<version> -f frontend/Dockerfile .
FROM node:24.12.0-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2.11.4-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
