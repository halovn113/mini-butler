# ── Butler v3 — Oracle Free Tier ARM64 (#93) ──────────────────────────────────
# Targets: linux/arm64 (Oracle Free Tier Ampere A1)
# Build:   docker build -t butler .
# Run:     docker compose up -d

FROM python:3.11-slim

# ── System packages ────────────────────────────────────────────────────────────
# curl: BrowserTool fetch; pup: HTML CSS selector; Node: readability-cli;
# nodejs/npm: readability-cli; portaudio: PyAudio (voice pipeline, optional)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        nodejs \
        npm \
        gosu \
        unzip \
    && npm install -g @mozilla/readability-cli \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── pup (CSS selector tool for BrowserTool.query) ─────────────────────────────
# Pre-built binary — avoids Go toolchain in image
# TARGETARCH is set automatically by Docker buildx (arm64 / amd64).
# For manual builds: docker build --build-arg TARGETARCH=amd64 -t bantz .
ARG TARGETARCH
ARG PUP_VERSION=0.4.0
RUN case "${TARGETARCH}" in \
      amd64) PUP_ARCH=amd64 ;; \
      *)     PUP_ARCH=arm64 ;; \
    esac \
    && curl -fsSL \
    "https://github.com/ericchiang/pup/releases/download/v${PUP_VERSION}/pup_v${PUP_VERSION}_linux_${PUP_ARCH}.zip" \
    -o /tmp/pup.zip \
    && unzip /tmp/pup.zip pup -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/pup \
    && rm /tmp/pup.zip

# ── App user (non-root) ────────────────────────────────────────────────────────
RUN useradd -m -s /bin/bash butler
WORKDIR /home/butler/app

# ── Application source + Python dependencies ──────────────────────────────────
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

# ── Data volume ────────────────────────────────────────────────────────────────
# ~/.local/share/butler — SQLite DB, logs, reflections
RUN mkdir -p /home/butler/.local/share/butler \
    && chown -R butler:butler /home/butler

VOLUME ["/home/butler/.local/share/butler"]

# ── Config ─────────────────────────────────────────────────────────────────────
# Mount .env at runtime:  -v $(pwd)/.env:/home/bantz/app/.env:ro
ENV PYTHONUNBUFFERED=1

USER bantz

# ── Default: headless daemon (Telegram bot + scheduler, no TUI) ───────────────
CMD ["python", "-m", "butler", "--daemon"]
