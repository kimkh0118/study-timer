import Cocoa
import WebKit
import UniformTypeIdentifiers
import ImageIO
import AVFoundation

// ───────── 저장 위치: ~/Library/Application Support/CharacterTimer ─────────
let supportDir: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("CharacterTimer", isDirectory: true)
    for sub in ["Wallpapers", "Sounds"] {
        try? FileManager.default.createDirectory(at: base.appendingPathComponent(sub, isDirectory: true),
                                                 withIntermediateDirectories: true)
    }
    return base
}()
let wallDir = supportDir.appendingPathComponent("Wallpapers", isDirectory: true)
let soundDir = supportDir.appendingPathComponent("Sounds", isDirectory: true)
let dataFile = supportDir.appendingPathComponent("data.json")
let backupFile = supportDir.appendingPathComponent("data.backup.json")

/// 파일 이름으로 안전한지(폴더 밖으로 못 나가는지) 확인
func isSafeName(_ name: String) -> Bool {
    !name.isEmpty && !name.contains("/") && !name.contains("..")
}

/// 저장된 기록을 읽어 JSON 문자열로 돌려준다. 망가진 파일이면 따로 보관하고 null.
func loadInitialJSON() -> String {
    guard let data = try? Data(contentsOf: dataFile) else { return "null" }
    if (try? JSONSerialization.jsonObject(with: data)) != nil {
        try? FileManager.default.removeItem(at: backupFile)
        try? FileManager.default.copyItem(at: dataFile, to: backupFile)
        return String(data: data, encoding: .utf8) ?? "null"
    }
    let stamp = Int(Date().timeIntervalSince1970)
    try? FileManager.default.moveItem(at: dataFile, to: supportDir.appendingPathComponent("data.broken-\(stamp).json"))
    if let b = try? Data(contentsOf: backupFile), (try? JSONSerialization.jsonObject(with: b)) != nil {
        return String(data: b, encoding: .utf8) ?? "null"
    }
    return "null"
}

// ───────── 사용자가 추가한 배경 사진을 ctwp://img/<파일> 로 보여 준다 ─────────
final class WallpaperScheme: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let name = url.lastPathComponent
        let file = wallDir.appendingPathComponent(name)
        guard isSafeName(name), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "CharacterTimer", code: 404))
            return
        }
        task.didReceive(URLResponse(url: url, mimeType: "image/jpeg", expectedContentLength: data.count, textEncodingName: nil))
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// ───────── 알람 소리: 시스템 소리 또는 내가 넣은 노래 ─────────
final class SoundPlayer {
    private var player: AVAudioPlayer?
    private var system: NSSound?
    private var stopTimer: Timer?

    /// spec: {type: "system", name} | {type: "file", file, start} | {type: "none"}
    func play(_ spec: [String: Any], loop: Bool, volume: Float, maxSec: Double) {
        stop()
        let type = spec["type"] as? String ?? "system"
        if type == "none" { return }

        if type == "file", let file = spec["file"] as? String, isSafeName(file),
           let p = try? AVAudioPlayer(contentsOf: soundDir.appendingPathComponent(file)) {
            p.numberOfLoops = loop ? -1 : 0
            let start = spec["start"] as? Double ?? 0
            if start > 0, start < p.duration - 1 { p.currentTime = start }
            p.volume = 0
            p.prepareToPlay()
            p.play()
            p.setVolume(volume, fadeDuration: 1.5)   // 갑자기 크게 나오지 않게 서서히
            player = p
        } else {
            let name = spec["name"] as? String ?? "Glass"
            if let s = NSSound(named: NSSound.Name(name))?.copy() as? NSSound {
                s.loops = loop
                s.volume = volume
                s.play()
                system = s
            }
        }

        if maxSec > 0 {
            let t = Timer(timeInterval: maxSec, repeats: false) { [weak self] _ in self?.fadeOutAndStop() }
            RunLoop.main.add(t, forMode: .common)
            stopTimer = t
        }
    }

    func fadeOutAndStop() {
        guard let p = player else { stop(); return }
        p.setVolume(0, fadeDuration: 1.2)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) { [weak self] in
            if self?.player === p { self?.stop() }
        }
    }

    func stop() {
        stopTimer?.invalidate()
        stopTimer = nil
        player?.stop()
        player = nil
        system?.stop()
        system = nil
    }
}

// ───────── 시간이 끝나면 모든 창 위(전체화면 앱 위 포함)에 뜨는 알림 창 ─────────
final class AlertPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class FinishOverlay: NSObject {
    private var panel: AlertPanel?
    var onAction: ((String) -> Void)?

    func show(title: String, body: String, image: NSImage?, actions: [[String: String]]) {
        close()
        guard let screen = NSScreen.main else { return }
        let W: CGFloat = 540, H: CGFloat = 172
        let x = screen.frame.midX - W / 2
        let y = screen.visibleFrame.maxY - H - 18     // 메뉴 막대 바로 아래

        let p = AlertPanel(contentRect: NSRect(x: x, y: y + 24, width: W, height: H),
                           styleMask: [.borderless, .nonactivatingPanel],
                           backing: .buffered, defer: false)
        p.level = .screenSaver
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = true
        p.hidesOnDeactivate = false
        p.isMovableByWindowBackground = true
        p.isReleasedWhenClosed = false

        let glass = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: W, height: H))
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.appearance = NSAppearance(named: .vibrantDark)
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 30
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 0.5
        glass.layer?.borderColor = NSColor(white: 1, alpha: 0.22).cgColor
        p.contentView = glass

        // 캐릭터 사진
        let side: CGFloat = 124
        let pic = NSView(frame: NSRect(x: 24, y: (H - side) / 2, width: side, height: side))
        pic.wantsLayer = true
        pic.layer?.cornerRadius = 24
        pic.layer?.masksToBounds = true
        pic.layer?.contentsGravity = .resizeAspectFill
        pic.layer?.contents = image
        pic.layer?.backgroundColor = NSColor(white: 0, alpha: 0.4).cgColor
        glass.addSubview(pic)

        // 빨간 점(머리핀 색)
        let tx = 24 + side + 22
        let dot = NSView(frame: NSRect(x: tx, y: H - 42, width: 8, height: 8))
        dot.wantsLayer = true
        dot.layer?.cornerRadius = 4
        dot.layer?.backgroundColor = NSColor(red: 0.878, green: 0.149, blue: 0.173, alpha: 1).cgColor
        glass.addSubview(dot)

        let titleLabel = NSTextField(labelWithString: title)
        titleLabel.font = .systemFont(ofSize: 26, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.frame = NSRect(x: tx + 16, y: H - 56, width: W - tx - 40, height: 34)
        glass.addSubview(titleLabel)

        let bodyLabel = NSTextField(wrappingLabelWithString: body)
        bodyLabel.font = .systemFont(ofSize: 14)
        bodyLabel.textColor = NSColor(white: 1, alpha: 0.72)
        bodyLabel.maximumNumberOfLines = 2
        bodyLabel.frame = NSRect(x: tx, y: H - 100, width: W - tx - 24, height: 40)
        glass.addSubview(bodyLabel)

        // 버튼 (첫 번째가 Return 키)
        var bx = tx
        for (i, a) in actions.enumerated() {
            let b = NSButton(title: a["label"] ?? "확인", target: self, action: #selector(tap(_:)))
            b.identifier = NSUserInterfaceItemIdentifier(a["id"] ?? "ok")
            b.bezelStyle = .rounded
            b.controlSize = .large
            b.font = .systemFont(ofSize: 14, weight: .semibold)
            if i == 0 { b.keyEquivalent = "\r" }          // Return = 첫 번째 버튼
            b.sizeToFit()
            b.frame = NSRect(x: bx, y: 22, width: max(96, b.frame.width + 18), height: 34)
            glass.addSubview(b)
            bx += b.frame.width + 10
        }

        // 위에서 살짝 내려오며 나타나기
        p.alphaValue = 0
        p.orderFrontRegardless()
        p.makeKey()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.28
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            p.animator().alphaValue = 1
            p.animator().setFrame(NSRect(x: x, y: y, width: W, height: H), display: true)
        }
        panel = p
    }

    @objc private func tap(_ sender: NSButton) {
        let id = sender.identifier?.rawValue ?? "ok"
        close()
        onAction?(id)
    }

    func close() {
        panel?.orderOut(nil)
        panel = nil
    }
}

// ───────── 화면(JS)과 Mac 사이의 연결 ─────────
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var web: WKWebView?
    weak var window: NSWindow?
    private var alarm: Timer?
    private var activity: NSObjectProtocol?
    private let io = DispatchQueue(label: "charactertimer.save")
    let sound = SoundPlayer()
    let overlay = FinishOverlay()

    override init() {
        super.init()
        overlay.onAction = { [weak self] id in
            self?.sound.stop()
            let safe = id.filter { $0.isLetter || $0.isNumber }
            self?.web?.evaluateJavaScript("window.__overlayAction && window.__overlayAction('\(safe)')")
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let json = body["data"] as? String { io.async { try? json.data(using: .utf8)?.write(to: dataFile, options: .atomic) } }
        case "pickWallpapers":
            pickWallpapers()
        case "deleteWallpaper":
            if let n = body["name"] as? String, isSafeName(n) { try? FileManager.default.removeItem(at: wallDir.appendingPathComponent(n)) }
        case "pickSounds":
            pickSounds()
        case "deleteSound":
            if let n = body["name"] as? String, isSafeName(n) { try? FileManager.default.removeItem(at: soundDir.appendingPathComponent(n)) }
        case "previewSound":
            sound.play(body["sound"] as? [String: Any] ?? [:], loop: false,
                       volume: Float(body["volume"] as? Double ?? 0.8), maxSec: 15)
        case "stopSound":
            sound.stop()
        case "finish":
            finish(body)
        case "dismiss":
            overlay.close()
            sound.stop()
        case "onTop":
            window?.level = (body["value"] as? Bool ?? false) ? .floating : .normal
        case "alarm":
            scheduleAlarm(at: body["at"] as? Double)
        case "busy":
            setBusy(body["value"] as? Bool ?? false)
        case "exportCSV":
            exportCSV(body["csv"] as? String ?? "", name: body["name"] as? String ?? "공부기록.csv")
        default:
            break
        }
    }

    /// 시간이 끝났을 때: 소리 + Dock 알림 + 맨 위 알림 창
    private func finish(_ b: [String: Any]) {
        let showOverlay = b["overlay"] as? Bool ?? true
        var maxSec = b["maxSec"] as? Double ?? 30
        if !showOverlay && maxSec <= 0 { maxSec = 10 }      // 끌 버튼이 없으면 무한 반복하지 않게
        sound.play(b["sound"] as? [String: Any] ?? [:], loop: true,
                   volume: Float(b["volume"] as? Double ?? 0.8), maxSec: maxSec)
        NSApp.requestUserAttention(.criticalRequest)
        guard showOverlay else { return }
        let actions = (b["actions"] as? [[String: Any]] ?? []).map { a in
            ["id": a["id"] as? String ?? "ok", "label": a["label"] as? String ?? "확인"]
        }
        overlay.show(title: b["title"] as? String ?? "끝났어요",
                     body: b["body"] as? String ?? "",
                     image: squareImage(src: b["image"] as? String ?? "", focus: b["focus"] as? String ?? "50% 30%"),
                     actions: actions.isEmpty ? [["id": "ok", "label": "확인"]] : actions)
    }

    /// 배경 사진에서 얼굴 쪽을 정사각형으로 잘라 온다.
    private func squareImage(src: String, focus: String) -> NSImage? {
        var url: URL?
        if src.hasPrefix("ctwp://img/") {
            let name = String(src.dropFirst("ctwp://img/".count))
            if isSafeName(name) { url = wallDir.appendingPathComponent(name) }
        } else if !src.contains(".."), !src.hasPrefix("data:"), let res = Bundle.main.resourceURL {
            url = res.appendingPathComponent(src)
        }
        guard let u = url, let source = CGImageSourceCreateWithURL(u as CFURL, nil),
              let cg = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return NSImage(named: NSImage.applicationIconName)
        }
        let pct = focus.split(separator: " ").map { Double($0.replacingOccurrences(of: "%", with: "")) ?? 50 }
        let fx = (pct.first ?? 50) / 100, fy = (pct.count > 1 ? pct[1] : 30) / 100
        let w = Double(cg.width), h = Double(cg.height), side = min(w, h)
        let rect = CGRect(x: (w - side) * fx, y: (h - side) * fy, width: side, height: side).integral
        guard let cropped = cg.cropping(to: rect) else { return nil }
        return NSImage(cgImage: cropped, size: NSSize(width: side, height: side))
    }

    /// 창이 가려져 있어도 정확한 시각에 화면을 깨운다.
    private func scheduleAlarm(at ms: Double?) {
        alarm?.invalidate()
        alarm = nil
        guard let ms = ms else { return }
        let t = Timer(fire: Date(timeIntervalSince1970: ms / 1000), interval: 0, repeats: false) { [weak self] _ in
            self?.web?.evaluateJavaScript("window.__nativeAlarm && window.__nativeAlarm()")
        }
        t.tolerance = 0.05
        RunLoop.main.add(t, forMode: .common)
        alarm = t
    }

    /// 타이머가 도는 동안 macOS가 앱을 재우지 않게 한다.
    private func setBusy(_ on: Bool) {
        if on, activity == nil {
            activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical],
                                                             reason: "공부 타이머 진행 중")
        } else if !on, let a = activity {
            ProcessInfo.processInfo.endActivity(a)
            activity = nil
        }
    }

    private func sendJS(_ fn: String, _ value: Any) {
        guard let d = try? JSONSerialization.data(withJSONObject: value),
              let s = String(data: d, encoding: .utf8) else { return }
        DispatchQueue.main.async { self.web?.evaluateJavaScript("window.\(fn) && window.\(fn)(\(s))") }
    }

    private func pickWallpapers() {
        guard let w = window else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.image]
        panel.message = "배경으로 쓸 사진을 고르세요"
        panel.prompt = "추가"
        panel.beginSheetModal(for: w) { [weak self] result in
            guard let self = self, result == .OK else { return }
            let urls = panel.urls
            DispatchQueue.global(qos: .userInitiated).async {
                self.sendJS("__wallpapersAdded", urls.compactMap { self.importImage($0) })
            }
        }
    }

    /// 사진을 최대 2600px JPEG로 바꿔 앱 폴더에 복사한다(HEIC 등도 처리).
    private func importImage(_ url: URL) -> [String: Any]? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2600,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9]) else { return nil }
        let name = UUID().uuidString.lowercased() + ".jpg"
        do { try jpg.write(to: wallDir.appendingPathComponent(name)) } catch { return nil }
        return ["name": name, "label": url.deletingPathExtension().lastPathComponent]
    }

    /// 노래 파일을 앱 폴더에 복사한다. 재생할 수 없는 파일(저작권 보호 파일 등)은 빼고 알려 준다.
    private func pickSounds() {
        guard let w = window else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.audio]
        panel.message = "알람으로 쓸 노래 파일을 고르세요 (mp3, m4a, wav 등)"
        panel.prompt = "추가"
        panel.beginSheetModal(for: w) { [weak self] result in
            guard let self = self, result == .OK else { return }
            let urls = panel.urls
            DispatchQueue.global(qos: .userInitiated).async {
                var added: [[String: Any]] = []
                var failed: [String] = []
                for u in urls {
                    let ext = u.pathExtension.isEmpty ? "m4a" : u.pathExtension.lowercased()
                    let name = UUID().uuidString.lowercased() + "." + ext
                    let dest = soundDir.appendingPathComponent(name)
                    let label = u.deletingPathExtension().lastPathComponent
                    do {
                        try FileManager.default.copyItem(at: u, to: dest)
                        let p = try AVAudioPlayer(contentsOf: dest)
                        guard p.duration > 0.5 else { throw NSError(domain: "CharacterTimer", code: 1) }
                        added.append(["file": name, "label": label, "duration": p.duration])
                    } catch {
                        try? FileManager.default.removeItem(at: dest)
                        failed.append(label)
                    }
                }
                self.sendJS("__soundsAdded", ["added": added, "failed": failed])
            }
        }
    }

    private func exportCSV(_ csv: String, name: String) {
        guard let w = window else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [.commaSeparatedText]
        panel.beginSheetModal(for: w) { result in
            guard result == .OK, let url = panel.url else { return }
            try? ("\u{FEFF}" + csv).data(using: .utf8)?.write(to: url, options: .atomic)
        }
    }
}

// ───────── 창 맨 위를 잡고 끌 수 있는 띠 ─────────
final class DragStrip: NSView {
    override var mouseDownCanMoveWindow: Bool { true }
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.zoom(nil) } else { window?.performDrag(with: event) }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let bridge = Bridge()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(WallpaperScheme(), forURLScheme: "ctwp")
        let ucc = config.userContentController
        ucc.add(bridge, name: "ct")
        ucc.addUserScript(WKUserScript(source: "window.__NATIVE__ = true; window.__INITIAL__ = \(loadInitialJSON());",
                                       injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let web = WKWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        web.autoresizingMask = [.width, .height]
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "캐릭터 타이머"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = .black
        window.contentMinSize = NSSize(width: 1000, height: 680)

        let root = NSView(frame: window.contentRect(forFrameRect: window.frame))
        web.frame = root.bounds
        root.addSubview(web)
        let strip = DragStrip(frame: NSRect(x: 0, y: root.bounds.height - 30, width: root.bounds.width, height: 30))
        strip.autoresizingMask = [.width, .minYMargin]
        root.addSubview(strip)
        window.contentView = root

        window.center()
        window.setFrameAutosaveName("CharacterTimerStudy")
        bridge.web = web
        bridge.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        bridge.sound.stop()
        bridge.overlay.close()
    }
}

// ───────── 메뉴 ─────────
func buildMenu() -> NSMenu {
    let main = NSMenu()

    let appItem = NSMenuItem(); main.addItem(appItem)
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "캐릭터 타이머 숨기기", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "캐릭터 타이머 종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu

    let editItem = NSMenuItem(); main.addItem(editItem)
    let edit = NSMenu(title: "편집")
    edit.addItem(withTitle: "실행 취소", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "실행 복귀", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "오려두기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "복사하기", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "전체 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit

    let winItem = NSMenuItem(); main.addItem(winItem)
    let win = NSMenu(title: "윈도우")
    win.addItem(withTitle: "최소화", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    win.addItem(withTitle: "닫기", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    winItem.submenu = win

    return main
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.mainMenu = buildMenu()
app.run()
