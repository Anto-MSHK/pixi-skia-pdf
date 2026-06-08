#!/usr/bin/env bash
#
# Сборка кастомной WASM-сборки CanvasKit с включённым PDF-бэкендом Skia.
#
# Скрипт выполняется ВНУТРИ Docker-контейнера (ubuntu:22.04). Он:
#   1. Ставит системные зависимости.
#   2. Клонирует форк Skia с готовыми PDF-биндингами (ветка canvas-kit-pdf).
#   3. Синхронизирует зависимости Skia (git-sync-deps).
#   4. Активирует emscripten нужной для этой ревизии Skia версии (activate-emsdk).
#   5. Компилирует CanvasKit в release-конфигурации с skia_enable_pdf=true.
#   6. Копирует canvaskit.js / canvaskit.wasm в смонтированную папку /out.
#
# Готовые артефакты затем кладутся в проект (public/canvaskit + типы).
set -euo pipefail

# Форк Skia, в котором реализованы Emscripten-биндинги для PDF
# (CanvasKit.MakePDFDocument / Document.beginPage / Document.close).
SKIA_REPO="https://github.com/pushpagarwal/skia.git"
SKIA_BRANCH="canvas-kit-pdf"

echo "==> [1/6] Системные зависимости"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  git python3 python3-distutils curl ca-certificates \
  build-essential clang lbzip2 xz-utils unzip \
  >/dev/null
ln -sf /usr/bin/python3 /usr/local/bin/python || true

echo "==> [2/6] Клонирование Skia ($SKIA_BRANCH, depth=1)"
cd /work
git clone --depth 1 --branch "$SKIA_BRANCH" "$SKIA_REPO" skia
cd skia

echo "==> [3/6] git-sync-deps (зависимости Skia — это долго)"
python3 tools/git-sync-deps

echo "==> [4/6] activate-emsdk (установка нужной версии emscripten)"
python3 bin/activate-emsdk

echo "==> [5/6] Компиляция CanvasKit (release + PDF)"
cd modules/canvaskit
# compile.sh по умолчанию (в этой ветке) собирает с PDF: skia_enable_pdf=true.
# Профиль release; явно НЕ передаём no_pdf.
./compile.sh release

echo "==> [6/6] Копирование артефактов в /out"
OUT_DIR=/out
mkdir -p "$OUT_DIR"
cp /work/skia/out/canvaskit_wasm/canvaskit.js   "$OUT_DIR/"
cp /work/skia/out/canvaskit_wasm/canvaskit.wasm "$OUT_DIR/"
# Тип-декларации с PDF API (из форка), пригодятся проекту.
cp /work/skia/modules/canvaskit/npm_build/types/index.d.ts "$OUT_DIR/canvaskit.d.ts" || true

echo "==> ГОТОВО. Артефакты:"
ls -la "$OUT_DIR"
