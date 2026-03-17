#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_NETWORK="${INTEGRATION_DOCKER_NETWORK:-hackz-megalo_default}"
MASTER_BASE_URL="${MASTER_BASE_URL:-http://master-service:8080}"
MASTER_WS_URL="${MASTER_WS_URL:-ws://master-service:8080/ws}"
TEST_TIMEOUT_SECONDS="${TEST_TIMEOUT_SECONDS:-10}"

docker run --rm \
  --network "$DOCKER_NETWORK" \
  -v "$ROOT_DIR:/src" \
  -w /src \
  -e MASTER_BASE_URL="$MASTER_BASE_URL" \
  -e MASTER_WS_URL="$MASTER_WS_URL" \
  -e TEST_TIMEOUT_SECONDS="$TEST_TIMEOUT_SECONDS" \
  golang:1.21.6-alpine \
  go test ./tests/integration -tags=integration -run TestMasterServiceTransportFlow -v "$@"
