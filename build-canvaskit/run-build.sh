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
WORK="$HERE/work"
mkdir -p "$OUT" "$WORK"

echo "Сборка CanvasKit+PDF в Docker (linux/amd64). Это занимает 30-90 минут (на ARM-хостах под эмуляцией — дольше)."
# --platform=linux/amd64 ОБЯЗАТЕЛЕН: emsdk 3.1.44 (его пинит Skia через
# bin/activate-emsdk) не имеет сборки под linux/arm64, и на arm64 скрипт
# activate-emsdk молча делает ранний return — emcc не ставится, компиляция
# падает с "emcc: not found". Поэтому на Apple Silicon собираем x86_64-образ
# под эмуляцией qemu (медленнее, но корректно и воспроизводимо).
#
# /work смонтирован на хост-папку build-canvaskit/work — клон Skia и
# синхронизированные зависимости (исходники, арх-независимы) переживают
# повторные запуски; бинарники инструментов (gn) fetch-gn перекачивает сам.
docker run --rm \
  --platform=linux/amd64 \
  -v "$HERE/build.sh:/build.sh:ro" \
  -v "$OUT:/out" \
  -v "$WORK:/work" \
  --memory=8g \
  ubuntu:22.04 \
  bash -c "bash /build.sh"

echo "Готово. Артефакты в: $OUT"
echo "Скопируйте их в проект:"
echo "  cp $OUT/canvaskit.js   public/canvaskit/canvaskit.js"
echo "  cp $OUT/canvaskit.wasm public/canvaskit/canvaskit.wasm"
