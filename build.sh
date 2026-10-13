#!/bin/bash
# 타이머 앱 v1 빌드 스크립트
#   ./build.sh            → build/캐릭터 타이머.app 만들기
#   ./build.sh --install  → 만든 앱을 바탕화면에 설치하고 실행
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NAME="캐릭터 타이머"
APP="$ROOT/build/$NAME.app"

if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "swiftc를 찾을 수 없어요. 먼저 'xcode-select --install'로 개발 도구를 설치하세요." >&2
  exit 1
fi

echo "▸ 앱 폴더 만드는 중"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/app/Info.plist" "$APP/Contents/Info.plist"
cp -R "$ROOT/app/Resources/." "$APP/Contents/Resources/"

echo "▸ Swift 컴파일 중"
xcrun swiftc -O "$ROOT/src/main.swift" \
  -o "$APP/Contents/MacOS/CharacterTimer" \
  -framework Cocoa -framework WebKit

echo "▸ 서명 중 (내 Mac에서만 쓰는 임시 서명)"
xattr -cr "$APP"
codesign --force --deep -s - "$APP"

echo "✓ 완료: $APP"

if [ "${1:-}" = "--install" ]; then
  DEST="$HOME/Desktop/$NAME.app"
  echo "▸ 바탕화면에 설치 중"
  pkill -x CharacterTimer 2>/dev/null && sleep 1 || true
  rm -rf "$DEST"
  cp -R "$APP" "$DEST"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST" || true
  open "$DEST"
  echo "✓ 바탕화면에 설치하고 실행했어요"
fi
