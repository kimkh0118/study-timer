#!/bin/bash
# Finder에서 더블클릭하면 빌드하고 바탕화면에 설치합니다.
cd "$(dirname "$0")" && ./build.sh --install
echo
read -n 1 -s -r -p "아무 키나 누르면 창이 닫혀요"
