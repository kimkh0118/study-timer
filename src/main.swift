import Cocoa
import WebKit
import UniformTypeIdentifiers
import ImageIO

// ───────── 저장 위치: ~/Library/Application Support/CharacterTimer ─────────
let supportDir: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("CharacterTimer", isDirectory: true)
    try? FileManager.default.createDirectory(at: base.appendingPathComponent("Wallpapers", isDirectory: true),
                                             withIntermediateDirectories: true)
    return base
}()
let wallDir = supportDir.appendingPathComponent("Wallpapers", isDirectory: true)
let dataFile = supportDir.appendingPathComponent("data.json")
let backupFile = supportDir.appendingPathComponent("data.backup.json")

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
        guard !name.isEmpty, !name.contains(".."), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "CharacterTimer", code: 404))
            return
        }
        task.didReceive(URLResponse(url: url, mimeType: "image/jpeg", expectedContentLength: data.count, textEncodingName: nil))
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// ───────── 화면(JS)과 Mac 사이의 연결 ─────────
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var web: WKWebView?
    weak var window: NSWindow?
    private var alarm: Timer?
    private var activity: NSObjectProtocol?
    private let io = DispatchQueue(label: "charactertimer.save")

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "save":
            if let json = body["data"] as? String { io.async { try? json.data(using: .utf8)?.write(to: dataFile, options: .atomic) } }
        case "pickWallpapers":
            pickWallpapers()
        case "deleteWallpaper":
            if let n = body["name"] as? String, !n.contains("/"), !n.contains("..") {
                try? FileManager.default.removeItem(at: wallDir.appendingPathComponent(n))
            }
        case "onTop":
            window?.level = (body["value"] as? Bool ?? false) ? .floating : .normal
        case "alarm":
            scheduleAlarm(at: body["at"] as? Double)
        case "busy":
            setBusy(body["value"] as? Bool ?? false)
        case "attention":
            NSApp.requestUserAttention(.criticalRequest)
            if body["sound"] as? Bool ?? true { NSSound(named: "Glass")?.play() }
        case "exportCSV":
            exportCSV(body["csv"] as? String ?? "", name: body["name"] as? String ?? "공부기록.csv")
        default:
            break
        }
    }

    /// 창이 가려져 있어도 정확한 시각에 화면을 깨운다.
    private func scheduleAlarm(at ms: Double?) {
        alarm?.invalidate()
        alarm = nil
        guard let ms = ms else { return }
        let fire = Date(timeIntervalSince1970: ms / 1000)
        let t = Timer(fire: fire, interval: 0, repeats: false) { [weak self] _ in
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
                let added = urls.compactMap { self.importImage($0) }
                guard let d = try? JSONSerialization.data(withJSONObject: added),
                      let s = String(data: d, encoding: .utf8) else { return }
                DispatchQueue.main.async {
                    self.web?.evaluateJavaScript("window.__wallpapersAdded && window.__wallpapersAdded(\(s))")
                }
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
