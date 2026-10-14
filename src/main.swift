import Cocoa
import WebKit
import UniformTypeIdentifiers
import ImageIO
import AVFoundation

// ───────── 저장 위치: ~/Library/Application Support/CharacterTimer ─────────
let supportDir: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("CharacterTimer", isDirectory: true)
    for sub in ["Wallpapers"] {
        try? FileManager.default.createDirectory(at: base.appendingPathComponent(sub, isDirectory: true),
                                                 withIntermediateDirectories: true)
    }
    return base
}()
let wallDir = supportDir.appendingPathComponent("Wallpapers", isDirectory: true)
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

// ───────── 알람 소리: Mac 효과음 · 앱에 든 음악 · Apple 미리 듣기(30초) ─────────
/// Apple 미리 듣기 주소인지 확인 (https + Apple 서버만)
func isApplePreview(_ u: URL) -> Bool {
    guard u.scheme == "https", let h = u.host?.lowercased() else { return false }
    return h.hasSuffix(".apple.com") || h.hasSuffix(".mzstatic.com")
}

final class SoundPlayer {
    private var player: AVAudioPlayer?
    private var system: NSSound?
    private var stopTimer: Timer?
    // Apple 미리 듣기(30초)는 인터넷으로 바로 틀어요
    private var stream: AVPlayer?
    private var streamEnd: NSObjectProtocol?
    private var streamStatus: NSKeyValueObservation?
    private var ramp: Timer?
    private var streamToken = 0
    var onStreamFailed: (() -> Void)?

    private func rampStream(to target: Float, over sec: Double, done: (() -> Void)? = nil) {
        ramp?.invalidate()
        guard let p = stream else { done?(); return }
        let from = p.volume, steps = max(1, Int(sec / 0.05))
        var i = 0
        let t = Timer(timeInterval: 0.05, repeats: true) { [weak self] tm in
            i += 1
            p.volume = from + (target - from) * Float(i) / Float(steps)
            if i >= steps { tm.invalidate(); self?.ramp = nil; done?() }
        }
        RunLoop.main.add(t, forMode: .common)
        ramp = t
    }

    private func playStream(_ u: URL, loop: Bool, volume: Float, fadeIn: Bool) {
        let item = AVPlayerItem(url: u)
        let p = AVPlayer(playerItem: item)
        p.automaticallyWaitsToMinimizeStalling = false
        p.volume = fadeIn ? 0 : volume
        stream = p
        streamToken += 1
        let token = streamToken
        streamEnd = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak p] _ in
            guard loop, let p = p else { return }
            p.seek(to: .zero); p.play()
        }
        streamStatus = item.observe(\.status, options: [.new]) { [weak self] it, _ in
            if it.status == .failed { DispatchQueue.main.async { if self?.streamToken == token { self?.failStream() } } }
        }
        // 8초 안에 시작 못 하면(인터넷 문제 등) 실패로 봐요
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self, weak item] in
            guard let self = self, self.streamToken == token, let item = item, item.status != .readyToPlay else { return }
            self.failStream()
        }
        p.play()
        if fadeIn { rampStream(to: volume, over: 1.5) }
    }

    private func failStream() {
        stopStream()
        onStreamFailed?()
    }

    private func stopStream() {
        streamToken += 1
        ramp?.invalidate(); ramp = nil
        stream?.pause()
        stream = nil
        if let o = streamEnd { NotificationCenter.default.removeObserver(o) }
        streamEnd = nil
        streamStatus?.invalidate()
        streamStatus = nil
    }

    /// spec: {type: "system", name} | {type: "bundle", name} | {type: "stream", url} | {type: "none"}
    func play(_ spec: [String: Any], loop: Bool, volume: Float, maxSec: Double, fadeIn: Bool = true) {
        stop()
        let type = spec["type"] as? String ?? "system"
        if type == "none" { return }

        if type == "stream", let str = spec["url"] as? String, let u = URL(string: str), isApplePreview(u) {
            playStream(u, loop: loop, volume: volume, fadeIn: fadeIn)
            if maxSec > 0 {
                let t = Timer(timeInterval: maxSec, repeats: false) { [weak self] _ in self?.fadeOutAndStop() }
                RunLoop.main.add(t, forMode: .common)
                stopTimer = t
            }
            return
        }

        var url: URL?
        if type == "bundle", let name = spec["name"] as? String, name.range(of: "^[a-z0-9-]+\\.caf$", options: .regularExpression) != nil {
            url = Bundle.main.resourceURL?.appendingPathComponent("sounds").appendingPathComponent(name)
        }
        if let u = url, let p = try? AVAudioPlayer(contentsOf: u) {
            p.numberOfLoops = loop ? -1 : 0
            let start = spec["start"] as? Double ?? 0
            if start > 0, start < p.duration - 1 { p.currentTime = start }
            p.volume = fadeIn ? 0 : volume
            p.prepareToPlay()
            p.play()
            if fadeIn { p.setVolume(volume, fadeDuration: 1.5) }   // 알람은 갑자기 크게 나오지 않게 서서히
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

    /// 재생 중인 소리 크기를 바로 바꾸기 (설정에서 들으며 조절)
    func setVolume(_ v: Float) {
        player?.volume = v
        system?.volume = v
        if stream != nil { ramp?.invalidate(); ramp = nil; stream?.volume = v }
    }

    private var fading = false
    /// 소리가 나는 중인지 (꺼지는 중이면 아니라고 봐요)
    var isPlaying: Bool { !fading && ((player?.isPlaying ?? false) || (system?.isPlaying ?? false) || stream != nil) }

    func fadeOutAndStop(_ duration: Double = 1.2) {
        if stream != nil {
            fading = true
            let tok = streamToken
            rampStream(to: 0, over: duration) { [weak self] in if self?.streamToken == tok { self?.stop() } }
            return
        }
        guard let p = player else { stop(); return }
        fading = true
        p.setVolume(0, fadeDuration: duration)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.1) { [weak self] in
            if self?.player === p { self?.stop() }
        }
    }

    func stop() {
        fading = false
        stopStream()
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
    var onCancel: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func cancelOperation(_ sender: Any?) { onCancel?() }      // Esc
}

final class FinishOverlay: NSObject {
    private var panel: AlertPanel?
    var isShowing: Bool { panel != nil }
    var onAction: ((String) -> Void)?

    func show(title: String, body: String, songTitle: String?, image: NSImage?, actions: [[String: String]]) {
        close()
        guard let screen = NSScreen.main else { return }

        let hasSong = !(songTitle ?? "").isEmpty
        let W: CGFloat = 540
        let H: CGFloat = hasSong ? 200 : 172
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
        p.onCancel = { [weak self] in self?.close(); self?.onAction?("ok") }

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

        // 왼쪽: 지금 배경 캐릭터
        let side: CGFloat = 124
        let pic = NSView(frame: NSRect(x: 24, y: (H - side) / 2, width: side, height: side))
        pic.wantsLayer = true
        pic.layer?.cornerRadius = 24
        pic.layer?.masksToBounds = true
        pic.layer?.contentsGravity = .resizeAspectFill
        pic.layer?.contents = image
        pic.layer?.backgroundColor = NSColor(white: 0, alpha: 0.4).cgColor
        glass.addSubview(pic)
        let leftEdge: CGFloat = 24 + side + 22
        let textW = W - leftEdge - 24

        // 빨간 점(머리핀 색) + 제목
        let top = H - 24
        let dot = NSView(frame: NSRect(x: leftEdge, y: top - 18, width: 8, height: 8))
        dot.wantsLayer = true
        dot.layer?.cornerRadius = 4
        dot.layer?.backgroundColor = NSColor(red: 0.878, green: 0.149, blue: 0.173, alpha: 1).cgColor
        glass.addSubview(dot)

        let titleLabel = NSTextField(labelWithString: title)
        titleLabel.font = .systemFont(ofSize: 26, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.frame = NSRect(x: leftEdge + 16, y: top - 32, width: textW - 16, height: 34)
        glass.addSubview(titleLabel)

        let bodyLabel = NSTextField(wrappingLabelWithString: body)
        bodyLabel.font = .systemFont(ofSize: 14)
        bodyLabel.textColor = NSColor(white: 1, alpha: 0.72)
        bodyLabel.maximumNumberOfLines = 2
        let bodyH: CGFloat = 40
        bodyLabel.frame = NSRect(x: leftEdge, y: top - 40 - bodyH, width: textW, height: bodyH)
        glass.addSubview(bodyLabel)

        if let song = songTitle, !song.isEmpty {
            let songLabel = NSTextField(labelWithString: "♪ " + song)
            songLabel.font = .systemFont(ofSize: 12, weight: .medium)
            songLabel.textColor = NSColor(white: 1, alpha: 0.55)
            songLabel.lineBreakMode = .byTruncatingTail
            songLabel.frame = NSRect(x: leftEdge, y: bodyLabel.frame.minY - 22, width: textW, height: 18)   // 본문 바로 아래(겹치지 않게)
            glass.addSubview(songLabel)
        }

        // 버튼 (첫 번째가 Return 키)
        var bx = leftEdge
        for (i, a) in actions.enumerated() {
            let b = NSButton(title: a["label"] ?? "확인", target: self, action: #selector(tap(_:)))
            b.identifier = NSUserInterfaceItemIdentifier(a["id"] ?? "ok")
            b.bezelStyle = .rounded
            b.controlSize = .large
            b.font = .systemFont(ofSize: 14, weight: .semibold)
            if i == 0 { b.keyEquivalent = "\r" }
            b.sizeToFit()
            b.frame = NSRect(x: bx, y: 22, width: max(92, b.frame.width + 16), height: 34)
            glass.addSubview(b)
            bx += b.frame.width + 8
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
    let volSound = SoundPlayer()      // 소리 크기 맞출 때만 쓰는 음악 (다른 소리와 따로)
    let overlay = FinishOverlay()

    private var fallbackVolume: Float = 0.8
    private var ringing = false      // 지금 소리가 진짜 알람인지(미리 듣기가 아니라)
    private var fallbackMaxSec: Double = 30

    override init() {
        super.init()
        overlay.onAction = { [weak self] id in
            guard let self = self else { return }
            self.sound.stop()
            self.ringing = false
            let safe = id.filter { $0.isLetter || $0.isNumber }
            self.web?.evaluateJavaScript("window.__overlayAction && window.__overlayAction('\(safe)')")
        }
        // 소리 크기 맞추는 중에 노래를 못 불러오면 피아노로 대신
        volSound.onStreamFailed = { [weak self] in
            guard let self = self else { return }
            self.volSound.play(["type": "bundle", "name": "piano.caf"], loop: true, volume: self.fallbackVolume, maxSec: 0, fadeIn: false)
        }
        // Apple 미리 듣기를 못 불러오면: 알람이면 기본 소리로 대신 울리고, 미리 듣기면 화면에 알려요.
        sound.onStreamFailed = { [weak self] in
            guard let self = self else { return }
            if self.ringing {
                self.sound.play(["type": "system", "name": "Glass"], loop: true, volume: self.fallbackVolume, maxSec: self.fallbackMaxSec)
            } else {
                self.sendJS("__previewFailed", [:])
            }
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
        case "previewSound":
            // 알람 목록에서 ▶ 눌러 듣기
            volSound.stop()
            ringing = false
            let spec = body["sound"] as? [String: Any] ?? [:]
            let vol = body["volume"] as? Double ?? 0.8
            let loop = body["loop"] as? Bool ?? false
            sound.play(spec, loop: loop, volume: Float(vol), maxSec: loop ? 0 : 35, fadeIn: false)
        case "volPreview":
            // 소리 크기 맞출 때: 고른 알람을 틀어 두고 크기를 바꿔요. 다른 소리가 나는 중이면 그 크기만 바꿔요.
            let v = Float(body["volume"] as? Double ?? 0.8)
            fallbackVolume = v
            if overlay.isShowing || sound.isPlaying {
                fallbackVolume = v
                sound.setVolume(v)
                return
            }
            if volSound.isPlaying { volSound.setVolume(v) }
            else {
                let spec = body["sound"] as? [String: Any] ?? ["type": "bundle", "name": "piano.caf"]
                volSound.play(spec, loop: true, volume: v, maxSec: 0, fadeIn: false)
            }
        case "volPreviewStop":
            volSound.fadeOutAndStop(0.5)
        case "setVolume":
            let v = Float(body["volume"] as? Double ?? 0.8)
            fallbackVolume = v
            volSound.setVolume(v)
            sound.setVolume(v)
        case "stopSound":
            sound.stop()
        case "finish":
            finish(body)
        case "dismiss":
            overlay.close()
            sound.stop()
            ringing = false
        case "musicSearch":
            musicSearch(term: body["term"] as? String ?? "", req: body["req"] as? Int ?? 0)
        case "compact":
            setCompact(body["on"] as? Bool ?? false)
        case "badge":
            let text = body["text"] as? String ?? ""
            NSApp.dockTile.badgeLabel = text.isEmpty ? nil : text
        case "onTop":
            onTop = body["value"] as? Bool ?? false
            applyTopLevel()
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

    private var onTop = false
    /// 창 층: 압정을 켜면 다른 창보다 항상 위(간소화 창은 데스크탑을 옮겨도 따라와요),
    /// 끄면 보통 창처럼 다른 창을 누르면 그 아래로 가요.
    func applyTopLevel() {
        guard let w = window else { return }
        if onTop {
            // 압정 켬: 모든 데스크탑에, 다른 앱이 전체 화면이어도 그 위에
            w.styleMask.insert(.nonactivatingPanel)
            w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            w.level = .floating
            if w.isVisible { w.orderFrontRegardless() }
        } else {
            // 압정 끔: 보통 창
            w.styleMask.remove(.nonactivatingPanel)
            w.collectionBehavior = []
            w.level = .normal
        }
    }

    /// 웹 화면이 그려지지 않고 검게 남을 때 다시 그리게 해요.
    func repaintWeb() {
        guard let web = web else { return }
        web.needsDisplay = true
        web.evaluateJavaScript("document.body.style.transform='translateZ(0)';requestAnimationFrame(function(){document.body.style.transform='';})")
    }

    /// 간소화: 화면 오른쪽 위 작은 창으로 줄이고, 다시 누르면 원래 크기·위치로.
    private(set) var normalFrame: NSRect?
    func setCompact(_ on: Bool) {
        guard let w = window else { return }
        let buttons: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
        if on {
            guard normalFrame == nil else { return }
            normalFrame = w.frame
            w.contentMinSize = NSSize(width: 360, height: 160)
            w.styleMask.remove(.resizable)
            w.isMovable = false                     // 시스템 끌기는 끄고, 끌어서 옮기기는 CTWebView가 직접 해요
            w.isMovableByWindowBackground = false
            (web as? CTWebView)?.dragLocked = true      // 끌면 웹 화면 대신 창이 움직여요
            (web as? CTWebView)?.onMoved = { p in UserDefaults.standard.set([Double(p.x), Double(p.y)], forKey: "compactOrigin") }
            applyTopLevel()                         // 압정(항상 위에) 설정을 그대로 따라요
            buttons.forEach { w.standardWindowButton($0)?.isHidden = true }
            let size = NSSize(width: 420, height: 180)
            let vf = (w.screen ?? NSScreen.main)?.visibleFrame ?? w.frame
            var origin = NSPoint(x: vf.maxX - size.width - 20, y: vf.maxY - size.height - 20)   // 처음엔 오른쪽 위
            // 전에 옮겨 둔 자리가 지금 화면 안에 있으면 거기로
            if let a = UserDefaults.standard.array(forKey: "compactOrigin") as? [Double], a.count == 2 {
                let r = NSRect(x: a[0], y: a[1], width: size.width, height: size.height)
                if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(r.insetBy(dx: 40, dy: 40)) }) { origin = r.origin }
            }
            w.setFrame(NSRect(origin: origin, size: size), display: true, animate: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.repaintWeb() }
        } else {
            guard let nf = normalFrame else { return }
            normalFrame = nil
            applyTopLevel()                         // 원래 창: 압정 설정대로
            w.styleMask.insert(.resizable)
            w.isMovable = true
            (web as? CTWebView)?.dragLocked = false
            buttons.forEach { w.standardWindowButton($0)?.isHidden = false }
            w.setFrame(nf, display: true, animate: true)
            w.contentMinSize = NSSize(width: 1000, height: 680)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.repaintWeb() }
        }
    }

    /// 시간이 끝났을 때: 소리 + Dock 알림 + 맨 위 알림 창
    private func finish(_ b: [String: Any]) {
        let showOverlay = b["overlay"] as? Bool ?? true
        var maxSec = b["maxSec"] as? Double ?? 30
        if !showOverlay && maxSec <= 0 { maxSec = 10 }      // 끌 버튼이 없으면 무한 반복하지 않게
        let vol = b["volume"] as? Double ?? 0.8
        let spec = b["sound"] as? [String: Any] ?? [:]
        fallbackVolume = Float(vol)
        fallbackMaxSec = maxSec
        volSound.stop()
        ringing = true

        sound.play(spec, loop: true, volume: Float(vol), maxSec: maxSec)

        NSApp.requestUserAttention(.criticalRequest)
        guard showOverlay else { return }
        let actions = (b["actions"] as? [[String: Any]] ?? []).map { a in
            ["id": a["id"] as? String ?? "ok", "label": a["label"] as? String ?? "확인"]
        }
        overlay.show(title: b["title"] as? String ?? "끝났어요",
                     body: b["body"] as? String ?? "",
                     songTitle: spec["title"] as? String,
                     image: squareImage(src: b["image"] as? String ?? "", focus: b["focus"] as? String ?? "50% 30%"),
                     actions: actions.isEmpty ? [["id": "ok", "label": "확인"]] : actions)
    }

    /// Apple(iTunes) 검색: 노래 제목·가수·앨범 그림·30초 미리 듣기 주소
    /// 한국 스토어는 노래 결과가 비어 있을 때가 많아서 한국·미국·일본 스토어를 같이 찾아 합쳐요.
    private func musicSearch(term: String, req: Int) {
        let q = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        let countries = ["KR", "US", "JP"]
        var buckets = [[[String: Any]]](repeating: [], count: countries.count)
        var anyOK = false
        let group = DispatchGroup()
        let lock = NSLock()
        for (i, c) in countries.enumerated() {
            guard var comps = URLComponents(string: "https://itunes.apple.com/search") else { continue }
            comps.queryItems = [URLQueryItem(name: "term", value: q), URLQueryItem(name: "country", value: c),
                                URLQueryItem(name: "media", value: "music"), URLQueryItem(name: "entity", value: "song"),
                                URLQueryItem(name: "limit", value: "25")]
            guard let u = comps.url else { continue }
            var rq = URLRequest(url: u, timeoutInterval: 10)
            rq.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", forHTTPHeaderField: "User-Agent")
            group.enter()
            URLSession.shared.dataTask(with: rq) { data, resp, err in
                defer { group.leave() }
                var items: [[String: Any]] = []
                let ok = err == nil && (resp as? HTTPURLResponse)?.statusCode == 200
                if let d = data, let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                   let results = j["results"] as? [[String: Any]] {
                    for r in results {
                        guard let id = (r["trackId"] as? NSNumber)?.int64Value, let prev = r["previewUrl"] as? String, !prev.isEmpty else { continue }
                        var art = r["artworkUrl100"] as? String ?? ""
                        art = art.replacingOccurrences(of: "100x100bb", with: "300x300bb")
                        items.append(["id": id, "title": r["trackName"] as? String ?? "", "artist": r["artistName"] as? String ?? "",
                                      "art": art, "preview": prev, "link": r["trackViewUrl"] as? String ?? ""])
                    }
                }
                lock.lock(); buckets[i] = items; if ok { anyOK = true }; lock.unlock()
            }.resume()
        }
        group.notify(queue: .main) { [weak self] in
            var seen = Set<String>(), merged: [[String: Any]] = []
            for list in buckets {
                for it in list {
                    let k = "\((it["title"] as? String ?? "").lowercased())|\((it["artist"] as? String ?? "").lowercased())"
                    let idk = "id:\(it["id"] ?? "")"
                    if seen.contains(k) || seen.contains(idk) { continue }
                    seen.insert(k); seen.insert(idk)
                    merged.append(it)
                }
            }
            self?.sendJS("__musicResults", ["req": req, "ok": anyOK, "items": Array(merged.prefix(40))])
        }
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
/// 간소화 중에는 끌기 동작을 무시하는 웹 화면(클릭은 그대로 돼요).
/// 간소화 중에는 아무 곳이나 눌러 끌면 창이 움직여요(웹 화면에는 끌기를 넘기지 않아서 검게 변하지 않아요).
/// 그냥 누르기만 하면 버튼이 평소처럼 눌려요.
final class CTWebView: WKWebView {
    var dragLocked = false                  // 간소화 모드
    var onMoved: ((NSPoint) -> Void)?
    private var downAt: NSPoint?
    private var downOrigin: NSPoint?
    private var moved = false

    override func mouseDown(with event: NSEvent) {
        if dragLocked, let w = window { downAt = NSEvent.mouseLocation; downOrigin = w.frame.origin; moved = false }
        super.mouseDown(with: event)
    }
    override func mouseDragged(with event: NSEvent) {
        guard dragLocked else { super.mouseDragged(with: event); return }
        guard let w = window, let a = downAt, let o = downOrigin else { return }
        let p = NSEvent.mouseLocation
        let dx = p.x - a.x, dy = p.y - a.y
        if !moved {
            if hypot(dx, dy) < 4 { return }          // 살짝 흔들린 건 클릭으로
            moved = true
            evaluateJavaScript("window.__dragMove && window.__dragMove(true)")
        }
        w.setFrameOrigin(NSPoint(x: o.x + dx, y: o.y + dy))
    }
    override func mouseUp(with event: NSEvent) {
        super.mouseUp(with: event)
        if moved, let w = window {
            evaluateJavaScript("window.__dragMove && window.__dragMove(false)")
            onMoved?(w.frame.origin)
        }
        downAt = nil; downOrigin = nil; moved = false
    }
    override var mouseDownCanMoveWindow: Bool { false }
    // 창이 뒤에 있을 때도 첫 클릭이 바로 버튼에 들어가게(창 앞으로 가져오는 데만 쓰이지 않게)
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 타이머 창. 보통 창처럼 쓰다가, 압정(항상 위에)을 켜면 다른 앱의 전체 화면 위에도 뜰 수 있게
/// '패널' 종류로 만들었어요(보통 창은 macOS가 다른 앱의 전체 화면 위로 못 올라가게 막아요).
final class MainPanel: NSPanel {
    override init(contentRect: NSRect, styleMask style: NSWindow.StyleMask, backing: NSWindow.BackingStoreType, defer flag: Bool) {
        super.init(contentRect: contentRect, styleMask: style, backing: backing, defer: flag)
        hidesOnDeactivate = false          // 다른 앱을 눌러도 사라지지 않게
        isFloatingPanel = false
        becomesKeyOnlyIfNeeded = false
    }
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class DragStrip: NSView {
    override var mouseDownCanMoveWindow: Bool { true }
    // 간소화 중에는 이 띠가 클릭을 가로채지 않고 아래 화면(끌어서 옮기기)으로 넘겨요
    override func hitTest(_ point: NSPoint) -> NSView? {
        if (window?.contentMinSize.width ?? 1000) < 500 { return nil }
        return super.hitTest(point)
    }
    override func mouseDown(with event: NSEvent) {
        let compact = (window?.contentMinSize.width ?? 1000) < 500      // 간소화 창은 두 번 눌러도 커지지 않게
        if compact { return }                                            // 간소화 창은 움직이지 않아요
        if event.clickCount == 2 { window?.zoom(nil) } else { window?.performDrag(with: event) }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    let bridge = Bridge()
    private var shown = false

    /// 화면이 다 그려진 뒤에 창을 부드럽게 띄운다(검은 화면 깜빡임 없이).
    private func reveal() {
        guard !shown else { return }
        shown = true
        window.alphaValue = 0
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.35
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window.animator().alphaValue = 1
        }
        // 창이 보이기 시작했으니 화면 안의 시작 모션을 틀어요.
        bridge.web?.evaluateJavaScript("window.__appShown && window.__appShown()")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { self.reveal() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(WallpaperScheme(), forURLScheme: "ctwp")
        let ucc = config.userContentController
        ucc.add(bridge, name: "ct")
        ucc.addUserScript(WKUserScript(source: "window.__NATIVE__ = true; window.__INITIAL__ = \(loadInitialJSON());",
                                       injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let web = CTWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        web.autoresizingMask = [.width, .height]
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        window = MainPanel(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
                           styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                           backing: .buffered, defer: false)
        window.title = "캐릭터 타이머"
        window.isReleasedWhenClosed = false
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        // 배경 투명도를 위해 창은 투명하게, 뒤에는 흐린 유리(바탕화면이 비쳐 보임)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.delegate = self
        window.contentMinSize = NSSize(width: 1000, height: 680)

        let root = NSVisualEffectView(frame: window.contentRect(forFrameRect: window.frame))
        root.material = .hudWindow
        root.blendingMode = .behindWindow
        root.state = .active
        root.appearance = NSAppearance(named: .vibrantDark)
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.reveal() }   // 혹시 늦어지면 그냥 띄우기
    }

    /// 창을 옮기거나 다른 화면으로 넘어간 뒤 웹 화면을 다시 그려요(검은 화면 방지).
    private func repaint() {
        guard let web = bridge.web else { return }
        web.needsDisplay = true
        web.evaluateJavaScript("document.body.style.transform='translateZ(0)';requestAnimationFrame(function(){document.body.style.transform='';})")
    }
    func windowDidMove(_ notification: Notification) { repaint() }
    func windowDidChangeOcclusionState(_ notification: Notification) { if window.occlusionState.contains(.visible) { repaint() } }
    func windowDidBecomeKey(_ notification: Notification) { repaint() }
    /// 화면을 그리는 프로세스가 꺼지면 검은 화면이 되니 다시 불러와요(기록은 저장돼 있어요).
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        bridge.setCompact(false)     // 다시 불러온 화면은 큰 화면으로 시작해요
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }
    func windowDidChangeScreen(_ notification: Notification) { repaint() }
    func windowDidChangeBackingProperties(_ notification: Notification) { repaint() }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    @objc func showMainWindow(_ sender: Any?) {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// 앱으로 돌아오면 Dock의 빨간 "!" 표시를 꺼요(타이머가 끝난 뒤 다시 시작하지 않았을 때 켜져 있어요).
    func applicationDidBecomeActive(_ notification: Notification) {
        bridge.web?.evaluateJavaScript("window.__appActivated && window.__appActivated()")
    }

    func applicationWillTerminate(_ notification: Notification) {
        NSApp.dockTile.badgeLabel = nil
        if let nf = bridge.normalFrame { window.setFrame(nf, display: false) }   // 다음에 켤 땐 원래 크기로
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
    win.addItem(.separator())
    win.addItem(withTitle: "타이머 창 보기", action: #selector(AppDelegate.showMainWindow(_:)), keyEquivalent: "0")
    winItem.submenu = win

    return main
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.mainMenu = buildMenu()
app.run()
