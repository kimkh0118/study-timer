# 타이머 앱 v3 개발 가이드

이 문서는 앱을 직접 고치고 다시 빌드하려는 사람을 위한 설명이에요.
앱 사용법은 [README.md](README.md), v1에서 바뀐 점과 이유는 [CHANGELOG.md](CHANGELOG.md)를 보세요.

---

## 1. 한눈에 보기

앱은 두 부분으로 나뉘어요.

```
┌──────────────────────── 캐릭터 타이머.app ────────────────────────┐
│                                                                    │
│  Swift 껍데기 (src/main.swift)          웹 화면 (app/Resources/)    │
│  ─────────────────────────              ────────────────────────   │
│  • 창 만들기, 메뉴                      • index.html 한 파일        │
│  • WKWebView에 index.html 띄우기          (HTML + CSS + JS)         │
│  • 기록 파일 읽기/쓰기          ◀────▶   • 타이머 계산              │
│  • 사진 고르기 창, 저장 창       메시지   • 달력, 통계, 설정 화면     │
│  • 정확한 시각에 알람                    • 기록 데이터 관리           │
│  • 맨 위 알림 창, 알람 소리 재생          • 알람 고르기, 노래 검색 화면 │
│  • Apple 노래 검색, 간소화 창            • 간소화 화면                │
│  • 항상 위에, Dock 알림                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  ~/Library/Application Support/CharacterTimer/
      data.json, data.backup.json, Wallpapers/
```

- **화면과 기능 대부분은 `index.html`** 에 있어요. 브라우저로 바로 열어서 개발할 수 있어요.
- **Swift 쪽은 웹 화면이 못 하는 일만** 해요. 파일 저장, Mac 창 제어, 시스템 대화상자 같은 것들이에요.
- 외부 라이브러리나 패키지 관리자를 하나도 쓰지 않아요. Xcode 프로젝트 파일도 없어요. `swiftc` 한 줄로 빌드돼요.

### 왜 이렇게 만들었나

| 시도 | 결과 |
|---|---|
| HTML 파일을 브라우저로 열기 | 바탕화면 앱처럼 쓰기 불편함 |
| `.webloc` 바로가기 | 아이콘을 못 바꾸고, 결국 브라우저 탭으로 열림 |
| 셸 스크립트 앱 + `chrome --app` | 학교 계정 크롬에서 `--app`이 무시되고 빈 새 탭만 열림 |
| **Swift + WKWebView (지금 방식)** | 브라우저 없이 자기 창으로 뜨고, 파일 저장, 알림, 항상 위가 모두 됨 |

---

## 2. 준비물

| 필요한 것 | 확인 방법 | 설치 |
|---|---|---|
| macOS 11 이상 | 애플 메뉴 → 이 Mac에 관하여 | |
| Swift 컴파일러 | `xcrun --find swiftc` | `xcode-select --install` |
| (선택) Python 3 + Pillow | `python3 -c "import PIL"` | `pip3 install pillow` (아이콘 만들 때만) |
| (선택) numpy, scipy, ffmpeg | `ffmpeg -version` | `pip3 install numpy scipy`, `brew install ffmpeg` (기본 음악을 다시 만들 때만) |

Xcode 앱 전체가 없어도 명령줄 도구만 있으면 빌드돼요.

---

## 3. 폴더 구조

```
study-timer/
├── README.md               사용 설명서
├── make.md                 이 문서
├── build.sh                빌드 스크립트
├── build.command           Finder에서 더블클릭용 (build.sh --install 실행)
├── CHANGELOG.md            버전별 바뀐 점과 이유
├── src/
│   └── main.swift          Swift 껍데기 전부 (약 840줄)
├── app/
│   ├── Info.plist          앱 이름, 번들 ID, 실행 파일 이름, 아이콘 이름, 버전
│   └── Resources/          앱 안에 그대로 복사되는 파일들
│       ├── index.html      화면과 기능 전부
│       ├── AppIcon.icns    앱 아이콘
│       ├── wallpapers/     기본 배경 1.jpg, 2.jpg
│       └── sounds/         기본 음악 6곡 (.caf, 무손실 ALAC)
├── tools/
│   ├── make_icon.py        아이콘 만드는 스크립트
│   ├── make_alarm_sounds.py  기본 음악 5곡 만드는 스크립트
│   └── make_piano.py       '잔잔한 피아노' 만드는 스크립트
└── docs/                   README용 스크린샷
```

빌드하면 이렇게 조립돼요.

```
build/캐릭터 타이머.app/
└── Contents/
    ├── Info.plist                 ← app/Info.plist
    ├── MacOS/CharacterTimer       ← src/main.swift를 컴파일한 실행 파일
    └── Resources/                 ← app/Resources/ 통째로
```

---

## 4. 빌드

```bash
./build.sh             # build/캐릭터 타이머.app 만들기
./build.sh --install   # 만든 뒤 바탕화면에 복사하고 실행
```

`build.sh`가 하는 일:

1. `build/캐릭터 타이머.app/Contents/` 폴더를 새로 만들어요.
2. `Info.plist`와 `Resources/`를 복사해요.
3. Swift를 컴파일해요.
   ```bash
   xcrun swiftc -O src/main.swift -o ".../Contents/MacOS/CharacterTimer" -framework Cocoa -framework WebKit
   ```
4. 임시 서명을 해요. 내 Mac에서만 쓰는 서명이라 Apple 개발자 계정은 필요 없어요.
   ```bash
   xattr -cr "$APP"              # 다운로드 표시(격리 속성) 지우기
   codesign --force --deep -s - "$APP"
   ```
5. `--install`이면 실행 중인 앱을 끄고(`pkill -x CharacterTimer`) 바탕화면에 덮어쓴 뒤 실행해요.

> 기록은 앱 밖(`~/Library/Application Support/CharacterTimer`)에 있어서, 다시 빌드하고 설치해도 지워지지 않아요.

### 화면만 고쳤을 때 빠르게 반영하기

`index.html`만 바꿨다면 다시 컴파일할 필요가 없어요.

```bash
cp app/Resources/index.html ~/Desktop/캐릭터\ 타이머.app/Contents/Resources/index.html
```

복사한 뒤 앱을 껐다 켜면 돼요. 단, 앱 안의 파일을 바꾸면 서명이 깨져요. 안 열리면 `./build.sh --install`로 다시 빌드하세요.

---

## 5. 브라우저에서 개발하기

`index.html`은 브라우저에서도 그대로 돌아가요. 화면 작업은 이렇게 하는 게 가장 빨라요.

```bash
open -a "Google Chrome" app/Resources/index.html
# 또는 Safari로 열어도 돼요
```

브라우저에서 열면 Mac 앱이 아니라는 걸 스스로 알아채고 이렇게 바꿔서 동작해요.

| 기능 | 앱 안 | 브라우저 |
|---|---|---|
| 기록 저장 | `data.json` 파일 | `localStorage` (`ct-state` 키) |
| 사진 추가 | Mac 사진 고르기 창 | `<input type=file>`, 사진은 data URL로 저장 |
| 끝났을 때 | 맨 위 알림 창(`NSPanel`) + 고른 알람 | 화면 안 알림 상자 + 웹 오디오로 만든 띵동 소리 |
| 노래 검색 | Swift가 Apple 검색 API 호출 | 브라우저 `fetch`로 같은 API 호출 |
| 간소화 | 창이 420×180으로 줄고 오른쪽 위 고정 | 화면 모양만 바뀜(창 크기는 그대로) |
| CSV 내보내기 | Mac 저장 창 | 파일 다운로드 |
| 항상 위에, Dock 알림 | 됨 | 아무 일도 안 함 |

브라우저 개발자 도구 콘솔에서 데이터를 직접 볼 수 있어요.

```js
state                           // 지금 상태 전체
state.sessions.length           // 기록 개수
localStorage.removeItem("ct-state"); location.reload();   // 처음 상태로
```

> 주의: 페이지를 떠날 때(`pagehide`) 메모리의 `state`를 저장해요. 콘솔에서 `localStorage`를 직접 고친 뒤 새로고침하면 그 값이 덮어써져요. 콘솔에서는 `state`를 고치고 `writeNow()`를 부르세요.

### 앱 안에서 웹 화면 디버깅하기

앱 안의 화면을 Safari 개발자 도구로 보고 싶다면 `src/main.swift`에서 `WKWebView`를 만든 바로 다음 줄에 이 줄을 넣고 다시 빌드하세요(macOS 13.3 이상).

```swift
if #available(macOS 13.3, *) { web.isInspectable = true }
```

그다음 Safari → 설정 → 고급 → "웹 개발자용 기능 보기"를 켜고, **개발자용 → (Mac 이름) → 캐릭터 타이머**를 고르면 돼요.

---

## 6. Swift 껍데기 (`src/main.swift`)

### 6-1. 구성 요소

| 이름 | 하는 일 |
|---|---|
| `supportDir`, `wallDir`, `dataFile`, `backupFile` | 저장 폴더 경로. 처음 실행할 때 폴더를 만들어요. |
| `loadInitialJSON()` | `data.json`을 읽어서 검사해요. 정상이면 백업을 만들고, 망가졌으면 `data.broken-시각.json`으로 옮긴 뒤 백업을 불러와요. |
| `WallpaperScheme` | `ctwp://img/파일이름` 주소 요청이 오면 `Wallpapers/` 폴더의 사진을 돌려줘요. |
| `SoundPlayer` | 알람 소리 재생기. `system`(Mac 효과음, `NSSound`), `bundle`(앱에 든 음악, `AVAudioPlayer`), `stream`(Apple 미리 듣기, `AVPlayer`) 세 종류를 같은 방법으로 틀어요. 반복, 서서히 커지기/작아지기, 정해 둔 시간 뒤 멈추기, 재생 중 크기 바꾸기가 돼요. `stream`은 Apple 서버 주소(`*.apple.com`, `*.mzstatic.com`)만 받아요. |
| `AlertPanel`, `FinishOverlay` | 끝났을 때 뜨는 맨 위 알림 창. `.screenSaver` 레벨 `NSPanel`이라 전체 화면 앱 위에도 떠요. 버튼을 누르면 JS의 `__overlayAction(id)`를 불러요. |
| `Bridge` | 웹 화면이 보내는 메시지를 받아 처리해요. 아래 표 참고. 알람용(`sound`)과 소리 크기 맞추기용(`volSound`) 재생기를 따로 가지고 있어서 서로 끊지 않아요. |
| `CTWebView` | WKWebView를 조금 바꾼 것. 간소화 중에는 마우스로 끄는 동작을 무시해요(검은 화면 방지). |
| `DragStrip` | 창 맨 위 30px짜리 투명한 띠. 웹 화면이 마우스를 가져가서 창을 못 끄는 문제를 막아요. 두 번 누르면 창을 키워요. 간소화 중에는 아무 일도 안 해요. |
| `AppDelegate` | 창(투명, 뒤에 흐린 유리 `NSVisualEffectView`)과 WKWebView를 만들고, 초기 데이터를 주입하고, `index.html`을 띄워요. 화면이 다 그려진 뒤 창을 부드럽게 띄우고 `__appShown()`으로 시작 모션을 알려요. 창을 옮기거나 다시 보일 때 화면을 새로 그리고, 화면 프로세스가 멈추면 다시 불러와요. |
| `buildMenu()` | 앱, 편집, 윈도우 메뉴. 편집 메뉴가 있어야 입력칸에서 ⌘C, ⌘V가 돼요. |

### 6-2. 실행 순서

```
앱 시작
 └ AppDelegate.applicationDidFinishLaunching
    ├ WKWebViewConfiguration 만들기
    │   ├ setURLSchemeHandler(WallpaperScheme, "ctwp")
    │   ├ userContentController.add(bridge, name: "ct")       ← JS → Swift 통로
    │   └ addUserScript("window.__NATIVE__ = true;
    │                    window.__INITIAL__ = <data.json 내용>;") ← 페이지보다 먼저 실행
    ├ WKWebView 만들고 index.html 불러오기
    ├ NSWindow 1180×760 (최소 1000×680), 제목 막대 투명
    └ 창 위치는 setFrameAutosaveName("CharacterTimerStudy")로 기억
```

### 6-3. 웹 화면 → Swift 메시지

JS에서 이렇게 보내요.

```js
window.webkit.messageHandlers.ct.postMessage({ type: "save", data: "..." });
```

`index.html`에서는 `post(type, extra)` 함수로 감싸 두었어요. 브라우저에서는 아무 일도 안 해요.

| type | 함께 보내는 값 | Swift가 하는 일 |
|---|---|---|
| `save` | `data`: 상태 전체 JSON 문자열 | 별도 큐에서 `data.json`에 덮어쓰기(atomic) |
| `pickWallpapers` | | 사진 고르기 창 → 고른 사진을 2600px 이하 JPEG로 바꿔 `Wallpapers/`에 저장 → JS의 `__wallpapersAdded([...])` 호출 |
| `deleteWallpaper` | `name`: 파일 이름 | `Wallpapers/`에서 그 파일 삭제 (`/`, `..` 들어간 이름은 거부) |
| `onTop` | `value`: true/false | 창 레벨을 `.floating` / `.normal`로 (간소화 중엔 항상 위 유지) |
| `alarm` | `at`: 끝나는 시각(ms) 또는 `null` | 그 시각에 JS의 `__nativeAlarm()`을 부르는 타이머 예약 / 취소 |
| `busy` | `value`: true/false | 타이머가 도는 동안 App Nap 막기 (`beginActivity`) |
| `badge` | `text` | Dock 아이콘 숫자(남은 분). 빈 문자열이면 지우기 |
| `finish` | `title`, `body`, `sound`, `volume`, `overlay`, `maxSec`, `image`, `focus`, `actions` | 알람 재생 + Dock 튀기기 + 맨 위 알림 창. `stream` 노래를 못 불러오면 Glass로 대신 울려요 |
| `dismiss` | | 알림 창 닫고 소리 멈추기 |
| `previewSound` | `sound`, `volume`, `loop` | 알람 창에서 ▶로 미리 듣기 |
| `stopSound` | | 미리 듣기 멈추기 |
| `volPreview` | `volume`, `sound` | 소리 크기 막대를 움직일 때. 처음엔 `sound`(고른 알람)를 반복 재생하고, 그다음부터는 크기만 바꿔요. 다른 소리가 나는 중이면 그 크기만 바꿔요 |
| `volPreviewStop` | | 크기 맞추기용 소리를 0.5초 동안 줄이며 끄기 |
| `setVolume` | `volume`: 0~1 | 지금 나는 모든 소리의 크기 바꾸기 |
| `musicSearch` | `term`, `req` | Apple 검색 API를 한국·미국·일본 스토어로 동시에 불러 합친 뒤 `__musicResults({ req, ok, items })` |
| `compact` | `on`: true/false | 간소화 창으로 바꾸기 / 되돌리기 |
| `exportCSV` | `csv`, `name` | 저장 창 → UTF-8 BOM을 붙여 저장(엑셀 한글 깨짐 방지) |

### 6-4. Swift → 웹 화면

| 방법 | 내용 |
|---|---|
| `window.__NATIVE__` | 페이지 시작 전에 `true`로 넣어 둬요. JS는 이 값으로 앱 안인지 판단해요. |
| `window.__INITIAL__` | 저장된 상태(JSON 객체) 또는 `null` |
| `__nativeAlarm()` | 예약한 시각이 되면 호출. JS가 바로 `tick()`을 돌려 끝났는지 확인해요. |
| `__wallpapersAdded(items)` | `items = [{ name, label }]`. JS가 배경 목록에 추가하고 첫 장으로 바꿔요. |
| `__overlayAction(id)` | 알림 창 버튼을 눌렀을 때. `ok`, `more5`, `skipBreak`, `startFocus` |
| `__musicResults({ req, ok, items })` | 노래 검색 결과. `items = [{ id, title, artist, art, preview, link }]`. `req`가 마지막 검색과 다르면 버려요 |
| `__previewFailed()` | 미리 듣기 노래를 못 불러왔을 때(인터넷 문제 등) |
| `__appShown()` | 창이 화면에 나타나기 시작한 순간. 시작 모션을 이때 틀어요 |

### 6-5. 왜 Swift에서 알람을 따로 예약하나

창이 가려지거나 최소화되면 macOS와 WebKit이 JS 타이머(`setInterval`)를 늦춰요. 그래서 시간이 다 돼도 몇 초에서 몇십 초 늦게 울릴 수 있어요.

- 남은 시간은 처음부터 `끝나는 시각 − 지금`으로 계산해서, 표시가 틀어지지는 않아요.
- 끝나는 순간은 Swift의 `Timer`(RunLoop `.common` 모드)가 정확히 JS를 깨워요.
- 타이머가 도는 동안은 `ProcessInfo.beginActivity(.userInitiatedAllowingIdleSystemSleep)`로 App Nap을 막아요. 화면 잠자기는 막지 않아요.

### 6-6. 알람 소리가 나는 길

```
JS chooseAlarm()  ──▶  sound 스펙 { type, name | url, title }
   │
   └ post("finish", { sound, volume, maxSec, ... })
        │
        ▼ Swift Bridge.finish
   SoundPlayer.play(spec, loop: true, fadeIn: true, maxSec)
        ├ "system"  → NSSound(named:)                     Mac 효과음
        ├ "bundle"  → AVAudioPlayer(Resources/sounds/x.caf) 기본 음악
        └ "stream"  → AVPlayer(Apple 미리 듣기 URL)        내 노래
                        ├ 끝나면 처음으로 돌아가 반복
                        └ 8초 안에 준비 안 되거나 실패 → Glass로 대신 울림
   FinishOverlay.show(...)  맨 위 알림 창
```

- 기본 음악은 `.caf`(ALAC, 무손실)예요. AAC(`.m4a`)는 앞뒤에 빈 구간이 생겨서 반복할 때 끊겨 들려요.
- 알람은 1.5초 동안 서서히 커지고, `maxSec`가 지나면 1.2초 동안 서서히 작아지며 꺼져요.

### 6-7. 간소화 창

`setCompact(true)`가 하는 일:

1. 지금 창 위치·크기를 기억(`normalFrame`)
2. 크기 조절 끄기, 신호등 버튼 숨기기, `isMovable = false`, `CTWebView.dragLocked = true`
3. `level = .floating`(항상 위), `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]`(모든 데스크탑)
4. 화면 오른쪽 위 420×180으로 이동

`false`면 반대로 되돌리고, 항상 위는 사용자의 압정 설정(`onTop`)대로 돌아가요. 앱을 끌 때 간소화 상태였다면 원래 크기로 저장해요.

---

## 7. 웹 화면 (`app/Resources/index.html`)

한 파일 안에 `<style>`, HTML, `<script>`가 순서대로 있어요. 스크립트는 주석 블록(`/* ═══ … ═══ */`)으로 나뉘어 있어요.

| 블록 | 내용 |
|---|---|
| 기본 | `$`, `pad`, `esc` 같은 도우미, 기본 배경 목록 `BUILTIN`, `post()` |
| 저장 | `defaults()`, `migrate()`, `loadState()`, `save()`(0.4초 모아서), `writeNow()`(바로) |
| 시간 계산 | `dayKey()`, `fmtDur()`, `totalsByDay()`, `subjectTotals()`, `streakDays()` |
| 타이머 엔진 | `start()`, `pause()`, `stopByUser()`, `complete()`, `checkpoint()`, `tick()` |
| 화면: 배경 | `applyWallpaper()`, `layoutArt()` |
| 화면: 시계·타이머·통계 | `renderClock()`, `renderControls()`, `renderLive()`, `renderStats()` |
| 시트 공통 | `openSheet(title, render)`, `closeSheet()` |
| 끝났을 때 알림 | `SOUNDS`(기본 음악·효과음 목록), `chooseAlarm()`, `notify()`, `focusLine()`, `todayLine()` |
| 달력 / 배경 / 설정 | 각 시트의 `render…()`와 이벤트 처리 |
| 알람 | `renderAlarms()`, 노래 검색 `searchSongs()`, `addSong()`, `removeSong()`, `listen()`(미리 듣기), `selectTile()` |
| 소리 크기 | `onVolumeInput()`, `previewAlarmSpec()`, `endVolumePreview()` |
| 간소화 | `setCompact()`, `renderMini()` |
| 항상 위, 토스트, 시작 | 나머지 |

### 7-1. 데이터 형식

`data.json`(브라우저에서는 `localStorage["ct-state"]`)은 이렇게 생겼어요.

```jsonc
{
  "v": 1,
  "sessions": [
    {
      "id": "k3j9a2mxq1z8",
      "start": 1791896400000,   // 시작 시각 (ms)
      "end":   1791899400000,   // 끝난 시각 (ms) — 일시정지 시간 포함
      "sec":   3000,            // 실제 공부한 초 — 일시정지 시간 제외
      "subject": "p0wq7e1r",    // subjects[].id
      "manual": true            // 직접 넣은 기록일 때만
    }
  ],
  "subjects": [
    { "id": "p0wq7e1r", "name": "수학", "color": "#e0262c" }
  ],
  "settings": {
    "goalMin": 240,             // 하루 목표(분)
    "timerMin": 50,             // 타이머 방식 시간(분)
    "focusMin": 25, "breakMin": 5, "longBreakMin": 15, "longEvery": 4,
    "onTop": false,
    "dim": 0.15,                // 1 - 배경 밝기 (0~0.7)
    "bgColor": "",              // 오른쪽 배경 색. ""면 사진을 흐리게
    "bgCustom": ["#ff8800"],    // 내가 추가한 색 (최대 8개)
    "bgClear": 0,               // 배경 투명도 0~0.9
    "overlay": true,            // 맨 위 알림 창 띄우기
    "alarmMode": "single",      // "single" | "random"
    "alarmPick": "it:1440857781",  // 하나만일 때 고른 소리 (아래 소리 키)
    "alarmSet": ["b:morning", "sys:Ping"],  // 랜덤일 때 목록
    "volume": 0.8,              // 0~1 (0이면 무음)
    "maxSec": 30,               // 알람 울리는 시간(초). 0이면 확인 누를 때까지
    "mode": "timer",            // "timer" | "stopwatch" | "pomo"
    "subject": "p0wq7e1r"       // 지금 고른 과목
  },
  "wallpapers": [
    { "id": "b1", "kind": "builtin", "src": "wallpapers/1.jpg", "focus": "50% 32%" },
    { "id": "u7x…", "kind": "user", "src": "ctwp://img/8f1c….jpg", "file": "8f1c….jpg", "label": "IMG_1234" }
  ],
  "wallpaper": "b1",            // 지금 쓰는 배경 id
  "wallPos": { "b1": "50% 30%" },  // 위치 맞추기로 정한 사진 위치 (배경 id별)
  "alarms": [                   // 내 노래 (Apple 미리 듣기)
    { "id": "it:1440857781", "kind": "it", "trackId": 1440857781, "title": "First Love", "artist": "sunny side",
      "art": "https://is1-ssl.mzstatic.com/…/300x300bb.jpg", "preview": "https://audio-ssl.itunes.apple.com/….m4a", "link": "https://music.apple.com/…" }
  ],
  "active": null                // 진행 중 중간 저장 (7-3 참고)
}
```

- **날짜 계산은 `start` 기준**이에요(`dayKey(start)`). 자정을 넘긴 공부도 시작한 날에 들어가요.
- **`migrate()`** 가 불러올 때마다 빠진 값을 기본값으로 채워요. 그래서 설정 항목을 새로 추가해도 기존 데이터가 깨지지 않아요. 새 설정을 만들면 `defaults().settings`에 기본값만 넣으면 돼요.
- 기본 배경(`kind: "builtin"`)은 저장된 값과 상관없이 항상 `BUILTIN`에서 새로 채워요.
- **소리 키**: `b:<이름>`(기본 음악, `SOUNDS` 참고), `sys:<이름>`(Mac 효과음), `it:<trackId>`(내 노래), `none`(소리 없음).
  `migrate()`가 없는 키나 v1.x의 유튜브·파일 알람 키를 `b:morning`으로 바꿔요.

### 7-2. 타이머 엔진

진행 중인 타이머는 `run` 변수 하나에 들어 있어요.

```js
run = {
  phase: "focus" | "break",
  kind: "short" | "long",       // 휴식일 때만
  target: 초 | null,             // null이면 스톱워치
  before: 초,                    // 일시정지 전까지 쌓인 시간
  startedAt: ms | null,          // null이면 일시정지 상태
  sessionStart: ms,
  subject: 과목 id,
}
```

흐른 시간은 항상 이렇게 계산해요. 그래서 `setInterval`이 늦게 돌아도 틀리지 않아요.

```js
elapsed = run.before + (run.startedAt ? (Date.now() - run.startedAt) / 1000 : 0)
```

상태 변화:

```
       start()            pause()
 없음 ─────────▶ 진행 ◀──────────▶ 일시정지
                  │     start()        │
                  │                    │ stopByUser()
                  ▼                    ▼
           elapsed ≥ target     commitFocus() → 기록 저장
                  │
             complete()
          ┌───────┴────────┐
     타이머·스톱워치      뽀모도로
       기록 → 끝     기록 → 휴식 run 자동 시작
                            │
                     휴식 끝 complete()
                            │
                  pomoRound + 1 → 끝 (다음 집중은 직접 시작)
```

- `tick()`은 250ms마다 돌고, 끝났는지 확인한 뒤 화면을 그려요. 통계 카드는 1초에 한 번만 다시 그려요.
- 기록은 `commitFocus()` 한 곳에서만 만들어져요. 60초 미만은 버려요.
- 뽀모도로의 `pomoRound`는 저장하지 않아요. 앱을 다시 열면 1번째부터 시작해요.

### 7-3. 앱이 갑자기 꺼졌을 때

`checkpoint()`가 집중 중일 때 20초마다(일시정지할 때는 바로) `state.active`에 중간 상태를 저장해요.

```js
state.active = { sessionStart, subject, checkAt: 저장한 시각, checkSec: 그때까지 공부한 초 }
```

다음에 앱이 켜질 때 `active`가 있고 60초 이상이면 기록으로 넣고 지워요. 그래서 최대 20초까지만 잃어버려요.

### 7-4. 배경 배치

`applyWallpaper()`가 사진을 불러온 뒤 `layoutArt(가로/세로 비율)`을 불러요.

| 비율 | `data-layout` | 모습 |
|---|---|---|
| 모든 사진 | `tall` | 왼쪽 칸에 사진. 칸 너비는 `clamp(320px, 38vw, 560px)`로 고정, 사진은 `object-fit: cover`로 채우고 경계는 흐리지 않고 깔끔하게 나눠요. 보이는 부분은 **위치 맞추기**로 정한 `state.wallPos[id]`(없으면 `focus`). |
| 1.15 이상 (가로) | `wide` | 사진을 화면 전체에 깔고, 오른쪽을 그라데이션으로 어둡게 |

뒤에는 항상 같은 사진을 크게 흐린 층(`.bg-blur`)이 깔려 있어서, 사진과 빈 곳 사이가 자연스럽게 이어져요.
기본 배경의 얼굴 위치는 `BUILTIN[].focus`(CSS `object-position`)로 맞춰요.

### 7-5. 디자인 규칙

CSS 맨 위 `:root`에 색과 글꼴이 모여 있어요.

| 변수 | 값 | 쓰는 곳 |
|---|---|---|
| `--pin` | `#e0262c` | 머리핀 빨강. 진행 중인 링, 오늘 막대, 달력 색 |
| `--tag` | `#f1c232` | 명찰 노랑. 목표 달성 표시 |
| `--glass` | `rgba(20,20,24,.36)` | 카드 유리. 어두운 유리라 밝은 사진에서도 흰 글씨가 보여요 |
| `--round` | `ui-rounded, "SF Pro Rounded"` | 숫자(시계, 남은 시간, 합계) |
| `--font` | `-apple-system, "Apple SD Gothic Neo"` | 나머지 글자 |

- 유리 효과는 `.glass` 클래스 하나로 통일해요. `backdrop-filter: blur(28px) saturate(170%)`에 안쪽 윗선 하이라이트와 0.5px 테두리를 더했어요.
- 빨강은 "지금 진행 중"에만 써요. 버튼은 흰색과 반투명 흰색만 써요.
- `prefers-reduced-motion`이 켜져 있으면 모든 애니메이션을 꺼요.

---

## 8. 자주 하는 수정

### 기본 과목 바꾸기

`index.html`의 `defaults()` 안 배열을 고쳐요. **처음 설치할 때만** 적용되고, 이미 쓰던 사람은 설정 화면에서 바꿔야 해요.

```js
const subjects = [["국어", "#4f8cff"], ["수학", "#e0262c"], ["영어", "#34c27a"], ["전공", "#f1c232"]]
```

### 타이머 빠른 버튼 바꾸기

`renderControls()`에서 `[25, 50, 90]`을 고쳐요.

### 기본 배경 바꾸거나 추가하기

1. 사진을 `app/Resources/wallpapers/3.jpg`처럼 넣어요. 세로 사진은 가로 736px 정도면 충분해요.
2. `BUILTIN` 배열에 한 줄 추가해요.
   ```js
   { id: "b3", kind: "builtin", src: "wallpapers/3.jpg", focus: "50% 30%" },
   ```
   `id`는 겹치면 안 되고, 한 번 정하면 바꾸지 마세요(사용자가 고른 배경을 이 값으로 기억해요).
3. 다시 빌드해요.

### 아이콘 바꾸기

```bash
pip3 install pillow
python3 tools/make_icon.py 원본사진.png --crop 왼쪽,위,오른쪽,아래
./build.sh --install
```

`--crop`은 원본에서 얼굴이 들어갈 **정사각형** 영역이에요. 결과는 `app/Resources/AppIcon.icns`와 `docs/icon.png`에 저장돼요.
아이콘이 바로 안 바뀌면 Dock에서 앱을 빼고 다시 넣거나, 아래 명령으로 아이콘 캐시를 새로 고쳐요.

```bash
touch ~/Desktop/캐릭터\ 타이머.app && killall Dock
```

### 기본 음악 바꾸거나 추가하기

1. `.caf` 파일을 `app/Resources/sounds/`에 넣어요. 이름은 영문 소문자·숫자·`-`만 돼요(예: `rain.caf`). wav나 mp3는 이렇게 바꿔요.
   ```bash
   afconvert -f caff -d alac 원본.wav app/Resources/sounds/rain.caf
   ```
2. `index.html`의 `SOUNDS` 배열에 한 줄 추가해요.
   ```js
   { key: "b:rain", kind: "music", title: "빗소리", sub: "자연", hue: 200, spec: { type: "bundle", name: "rain.caf", title: "빗소리" } },
   ```
   `key`는 `b:` 뒤에 영문만 써요. `hue`는 칸 색(0~360)이에요.
3. 다시 빌드해요.

지금 들어 있는 6곡은 `python3 tools/make_alarm_sounds.py`, `python3 tools/make_piano.py`로 다시 만들 수 있어요.

### 새 Mac 기능 추가하기 (예: 알림 센터 알림)

1. `index.html`에서 `post("새기능", { ... })`로 보내요.
2. `main.swift`의 `Bridge.userContentController(_:didReceive:)` `switch`에 `case "새기능":`을 추가해요.
3. Swift에서 JS로 결과를 돌려줄 때는 `web?.evaluateJavaScript("window.__콜백 && window.__콜백(값)")`처럼 써요. 콜백은 JS에서 `window.__콜백 = ...`으로 미리 만들어 둬요.

### 버전 올리기

`app/Info.plist`의 두 값을 같이 올려요.

```xml
<key>CFBundleVersion</key><string>2.0</string>
<key>CFBundleShortVersionString</key><string>2.0</string>
```

데이터 구조를 바꿀 때는 `state.v`를 올리고 `migrate()`에서 옛 형식을 새 형식으로 바꿔 주세요.

---

## 9. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `xcrun: error: invalid active developer path` | 명령줄 도구가 없어요. `xcode-select --install` |
| 빌드는 됐는데 앱이 안 열려요 | `xattr -cr` 후 `codesign`을 다시 하거나 `./build.sh --install`을 다시 실행 |
| 화면이 검게만 나와요 | `Contents/Resources/index.html`이 있는지 확인. 배경은 `Contents/Resources/wallpapers/`에 있어야 해요 |
| 추가한 배경이 안 보여요 | `~/Library/Application Support/CharacterTimer/Wallpapers/`에 파일이 있는지 확인 |
| 입력칸에서 ⌘V가 안 돼요 | `buildMenu()`의 편집 메뉴를 지우지 마세요 |
| 창을 끌 수 없어요 | `DragStrip`이 맨 위에 있는지 확인. 웹 화면 위쪽 30px 안에는 버튼을 두지 마세요(지금은 `.main` 위 여백 40px) |
| 기록이 0으로 보여요 | 브라우저와 앱은 저장소가 달라요. 브라우저에서 넣은 기록은 앱에 안 보여요 |
| 노래 검색 결과가 없어요 | 인터넷 확인. 한국 스토어는 결과가 비는 경우가 많아서 `musicSearch`가 KR·US·JP를 같이 찾아요 |
| 간소화 창이 검게 변해요 | `CTWebView.dragLocked`, `DragStrip`의 간소화 검사, `index.html`의 `dragstart` 막기가 있는지 확인 |
| 기본 음악이 안 나와요 | `Contents/Resources/sounds/*.caf`가 있는지 확인. 파일 이름은 `^[a-z0-9-]+\.caf$`만 허용해요 |

---

## 10. 개발 기록

1. 캐릭터 그림을 SVG로 직접 그려 봄 → 원본과 너무 달라서 포기하고, 원본 웹툰 장면을 배경으로 쓰기로 함
2. 아이폰 잠금화면 느낌의 세로형 유리 타이머(HTML 한 파일)
3. `.webloc` 바로가기 → 셸 스크립트 앱 + 크롬 앱 모드 → 크롬이 `--app`을 무시해서 실패
4. Swift + WKWebView로 진짜 Mac 앱을 만듦
5. **v1**: 가로형 화면, 날짜·과목별 기록, 달력, 뽀모도로, 배경 관리, 항상 위, CSV 내보내기
6. v1.1~v1.7: 맨 위 알림 창, 유튜브·노래 파일 알람, 간소화 모드, 소리 크기 미리 듣기 → 유튜브 자동 재생이 끝까지 불안정
7. v1.8~v1.9: 알람을 앱에 든 소리 + Apple Music 30초 미리 듣기로 정리, 간소화 창 고정
8. **v2.0**: 알림 문구 다듬기, 안 쓰는 코드 정리, 문서 정리 (자세한 이유는 [CHANGELOG.md](CHANGELOG.md))
9. **v2.01**: 배경 위치·색·밝기·투명도, 달력 크기 고정, 과목 +N, 간소화 창 끌어서 옮기기
10. **v3.01**: 글씨 색, 피그마식 색 고르기 + 저장한 색, 이번 주 그래프 색(자동/기본 색)과 미리 보기

### 다음에 해 볼 만한 것

- 메뉴 막대에 남은 시간 표시 (`NSStatusItem`)
- 내 노래 칸에서 Apple Music 앱으로 바로 열기 (`link` 값은 이미 저장돼 있어요)
- 알림 센터 알림 (`UNUserNotificationCenter`, 정식 서명 필요)
- 과목별·월별 통계 화면
- iCloud Drive 폴더에 `data.json`을 둬서 여러 Mac에서 같이 쓰기
- 집중 중 방해 금지 모드 켜기 (단축어 연동)
