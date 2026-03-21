#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALLER_DIR="$(pwd)"

cd "$SCRIPT_DIR"

docker compose build worker
docker compose up -d ollama

echo "waiting for ollama..."
until docker compose exec ollama ollama list &>/dev/null; do
  sleep 1
done

MODEL="${MODEL:-qwen3:14b}"
if ! docker compose exec ollama ollama list | grep -q "${MODEL%%:*}"; then
  echo "pulling $MODEL..."
  docker compose exec ollama ollama pull "$MODEL"
fi

echo "running subtitle pipeline..."
HOST_DIR="$CALLER_DIR" docker compose run --rm worker "$@"
