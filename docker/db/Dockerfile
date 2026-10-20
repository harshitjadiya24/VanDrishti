# Postgres 16 + PostGIS 3, native on arm64 and amd64. postgis/postgis publishes amd64 only,
# so this extends the multi-arch postgres image with the PGDG package.
FROM postgres:16

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-16-postgis-3; \
    rm -rf /var/lib/apt/lists/*
