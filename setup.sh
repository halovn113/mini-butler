#!/usr/bin/env bash
# Butler v2 — Quick setup
set -e

echo "🔧 Butler v2 setup..."

python3 -c "import sys; assert sys.version_info >= (3,11), 'Python 3.11+ required'" \
  || { echo "❌ Python 3.11+ required"; exit 1; }

# Venv
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

# Base install
pip install -e "." --quiet
echo "✓ Base packages installed"

# MarianMT (optional but recommended for Turkish support)
read -p "Install MarianMT for TR↔EN translation? (~300MB) [y/N] " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  pip install -e ".[translation]" --quiet
  echo "✓ MarianMT installed"
  # Update .env
  if [ -f .env ]; then
    sed -i 's/BUTLER_TRANSLATION_ENABLED=false/BUTLER_TRANSLATION_ENABLED=true/' .env
    echo "✓ .env updated: BUTLER_TRANSLATION_ENABLED=true"
  fi
fi

# Google integrations (optional — Gmail / Calendar / Classroom)
read -p "Install Google integrations (Gmail / Calendar / Classroom)? [y/N] " yn
if [[ "$yn" =~ ^[Yy]$ ]]; then
  pip install -e ".[google]" --quiet
  echo "✓ Google integrations installed"
fi

# .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ .env created from .env.example"
fi

echo ""
echo "✅ Done!"
echo ""
echo "Next:"
echo "  source .venv/bin/activate"
echo "  python -m butler --doctor"
echo "  python -m butler"