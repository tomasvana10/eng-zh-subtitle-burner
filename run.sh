#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CALLER_DIR="$(pwd)"

cd "$SCRIPT_DIR"

# Check if using API translation (skip ollama setup if so)
USE_API=false
for arg in "$@"; do
  if [[ "$arg" == "--translate-via" ]]; then
    USE_API=__next__
  elif [[ "$USE_API" == "__next__" ]]; then
    [[ "$arg" == "local" || -z "$arg" ]] && USE_API=false || USE_API=true
  fi
done

docker compose build worker

if [[ "$USE_API" != "true" ]]; then
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
fi

echo "running subtitle pipeline..."

# Resolve the input file (first positional arg) and mount its directory separately
INPUT_HOST="$(realpath "$1")"
INPUT_DIR="$(dirname "$INPUT_HOST")"
INPUT_NAME="$(basename "$INPUT_HOST")"
shift

# /data = caller's cwd (for output), /input = input file's directory
HOST_DIR="$CALLER_DIR" docker compose run -v "$INPUT_DIR:/input" --rm worker "/input/$INPUT_NAME" "$@"
