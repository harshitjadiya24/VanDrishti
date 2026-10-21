# VanDrishti API image: the web API only. No PyTorch: model stages run as batch jobs with
# the `ml` dependency group (see docs/RUNBOOK.md), never inside the API process.
#   docker build -t vandrishti/api:<version> backend
FROM python:3.11.15-slim-bookworm AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv
# uv from PyPI (pinned) rather than another registry: one less image to pull.
RUN pip install --no-cache-dir uv==0.12.23
WORKDIR /src
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-group ml --no-install-project
COPY README.md* ./
COPY src ./src
COPY alembic.ini ./
RUN uv sync --frozen --no-dev --no-group ml --no-editable

FROM python:3.11.15-slim-bookworm
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    VANDRISHTI_ENV=prod VANDRISHTI_API_HOST=0.0.0.0 \
    VANDRISHTI_STORAGE_ROOT=/data/store
RUN groupadd --system --gid 10001 vandrishti \
 && useradd --system --uid 10001 --gid vandrishti --home /app --shell /usr/sbin/nologin vandrishti \
 && mkdir -p /data/store /app && chown -R vandrishti:vandrishti /data /app
COPY --from=build /opt/venv /opt/venv
COPY --from=build /src/alembic.ini /app/alembic.ini
COPY --from=build /src/src/vandrishti/db/migrations /app/src/vandrishti/db/migrations
WORKDIR /app
USER vandrishti
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status != 200)"
CMD ["vandrishti-api"]
