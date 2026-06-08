#!/usr/bin/env bash
#
# Запуск сборки CanvasKit+PDF в Docker с хоста.
# Артефакты появятся в build-canvaskit/out/, лог — в build-canvaskit/build.log.
#
# Использование:
#   bash build-canvaskit/run-build.sh
#
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"

echo "Сборка CanvasKit+PDF в Docker (ubuntu:22.04). Это занимает 30-90 минут."
docker run --rm \
  -v "$HERE/build.sh:/build.sh:ro" \
  -v "$OUT:/out" \
  --memory=8g \
  ubuntu:22.04 \
  bash -c "mkdir -p /work && bash /build.sh"

echo "Готово. Артефакты в: $OUT"
echo "Скопируйте их в проект:"
echo "  cp $OUT/canvaskit.js   public/canvaskit/canvaskit.js"
echo "  cp $OUT/canvaskit.wasm public/canvaskit/canvaskit.wasm"
