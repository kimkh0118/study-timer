/* 다마고치+ — 메인 창 쪽 연결 코드
 * 공부 기록(state.sessions)과 규칙 엔진(TamaEngine)을 잇고, 다운로드 · 활성화 · 둥지 · 펫 창 동기화를 맡아요.
 * index.html의 전역(state, run, save, writeNow, post, toast, openSheet, dayKey …)을 그대로 써요. */
const TAMA_BASE = "https://raw.githubusercontent.com/kimkh0118/study-timer/main/tama-pack/";
let tamaPack = null;
(function loadTamaPack() {
  let p = window.__TAMA_PACK__ || null;
  if (!p && !NATIVE) try { p = JSON.parse(localStorage.getItem("ct-tama-pack")); } catch (e) {}
  if (p && !TamaEngine.validatePack(p)) tamaPack = p;
})();
if (!state.tama || typeof state.tama !== "object") state.tama = TamaEngine.defaultState();
if (!Array.isArray(state.tama.fx)) state.tama.fx = [];
if (state.tama.installed && !tamaPack) state.tama.installed = false;     // 받은 파일이 사라졌으면 다시 받기
const tamaReady = () => !!(tamaPack && state.tama.installed);
const tamaNow = () => Date.now() + (window.__tamaClock || 0);            // 검증용 시계(화면에는 노출하지 않아요)
const TAMA_ASSET_BASE = NATIVE ? "ctwp://tama/" : (window.__TAMA_LOCAL_BASE__ || TAMA_BASE);
function tamaAsset(path) {
  if (!path || !tamaPack || !(tamaPack.assets || []).includes(path)) return null;
  return TAMA_ASSET_BASE + path;
}
TamaArt.imageFor = (sp, stage) => tamaAsset(sp.img && sp.img[stage]);
TamaArt.assetFor = tamaAsset;

function tamaSessions() {
  const out = state.sessions.map((s) => ({ start: s.start, sec: s.sec, manual: !!s.manual }));
  if (run && run.phase === "focus" && run.startedAt) out.push({ start: run.sessionStart, sec: Math.floor(elapsed()), manual: false, live: true });
  return out;
}
const tamaCtx = () => ({ now: tamaNow(), pack: tamaPack, sessions: tamaSessions(), dayKey, goalSec: state.settings.goalMin * 60 });
function tamaMinGoal() { return tamaReady() && state.tama.enabled ? tamaPack.config.minGoalMin : 30; }

/* ── 상태 갱신 · 이벤트 ── */
let tamaLast = null;                 // 펫 창에 보낼 마지막 동작 결과
function tamaHandleEvents(events) {
  const T = state.tama;
  for (const e of events) {
    if (e.type === "bonus") toast(`오늘 목표 달성! 보너스 ${e.coins}코인`);
    else if (e.type === "eggDay") toast(`알이 따뜻해졌어요. 부화까지 ${e.count}/${tamaPack.config.hatchDays}일`);
    else if (e.type === "died") toast("친구가 떠났어요. 둥지에서 새 알을 골라 주세요");
    else if (["hatch", "grow"].includes(e.type)) {
      if (!T.pet || T.pet.dead) continue;
      const id = `${T.pet.id}:${e.type}:${e.stage || "baby"}`;
      if (!T.seen || typeof T.seen !== "object") T.seen = {};
      if (T.seen[id] || T.fx.some(x => x.id === id)) continue;
      T.seen[id] = true;
      T.fx.push({ ...e, id, at: tamaNow() });
      tamaOpenPet(true);             // 부화·성장은 펫 창에서 보여 줘요
    }
  }
}
function tamaTick() {
  if (!tamaReady()) { tamaRender(); return; }
  const ev = TamaEngine.refresh(state.tama, tamaCtx());
  if (ev.length) { tamaHandleEvents(ev); save(); }
  tamaRender();
}

/* ── 화면 갱신 ── */
function tamaRender() {
  const T = state.tama, on = tamaReady() && T.enabled;
  const d = tamaReady() ? TamaEngine.derive(T, tamaCtx()) : null;
  // 툴바 점: 배고픔·떠남 알림
  const dot = $("#tamaDot");
  if (dot) {
    const lvl = d && d.hunger ? d.hunger.level : "";
    dot.hidden = !(on && (lvl === "very" || lvl === "dead" || (T.fx && T.fx.length)));
  }
  renderNest(on && !T.pet);
  if (sheetRender === renderTama) renderTama();
  tamaSync(d);
}

/* ── 펫 창(따로 뜨는 작은 창) ── */
function tamaPayload(d) {
  return { tama: state.tama, derived: d || (tamaReady() ? TamaEngine.derive(state.tama, tamaCtx()) : null), pack: tamaPack,
           assetBase: TAMA_ASSET_BASE, now: tamaNow(), goalMin: state.settings.goalMin, last: tamaLast, onTop: !!state.settings.onTop };
}
let petFrame = null;
function tamaSync(d) {
  if (!tamaReady() || !state.tama.winOpen) return;
  const data = tamaPayload(d);
  if (NATIVE) post("petSync", { data });
  else if (petFrame && petFrame.contentWindow) petFrame.contentWindow.postMessage({ petSync: JSON.parse(JSON.stringify(data)) }, "*");
}
function tamaOpenPet(open) {
  if (!tamaReady()) return;
  state.tama.winOpen = open;
  save();
  if (NATIVE) post("petWindow", { open, onTop: !!state.settings.onTop });
  else {
    const box = $("#petFloat");
    box.hidden = !open;
    if (open && !petFrame) { petFrame = document.createElement("iframe"); petFrame.src = "pet.html"; petFrame.title = "다마고치+"; box.appendChild(petFrame); }
  }
  if (open) setTimeout(() => tamaSync(), 50);
}
window.__petWindowClosed = () => { state.tama.winOpen = false; save(); };
/* 펫 창에서 온 동작 */
window.__petAction = (a) => {
  if (!a || !tamaReady()) return;
  if (a.type === "ready") { tamaSync(); return; }
  if (a.type === "close") { tamaOpenPet(false); return; }
  if (a.type === "ack") { state.tama.fx = state.tama.fx.filter((x) => x.id !== a.fxId); save(); tamaRender(); return; }
  if (a.type === "goSteal") { tamaOpenPet(false); renderNest(true); toast("둥지에서 새 알을 골라 주세요"); }
  const r = TamaEngine.act(state.tama, a, tamaCtx());
  if (r.dup) return;
  tamaLast = { actId: a.actId || null, ok: r.ok, msg: r.msg, type: a.type, food: a.food || null };
  if (r.events) tamaHandleEvents(r.events);
  writeNow();
  tamaRender();
};
if (!NATIVE) window.addEventListener("message", (e) => { if (e.data && e.data.petAction) window.__petAction(e.data.petAction); });

/* ── 다운로드(처음 한 번) ── */
let tamaDl = null;                    // { phase, done, total, file, error }
function tamaDownload() {
  tamaDl = { phase: "pack", done: 0, total: 0, file: "pack.json", error: "" };
  renderTama();
  if (NATIVE) post("tamaDownload", { base: TAMA_BASE });
  else browserDownload().catch((e) => window.__tamaDone({ ok: false, error: String(e && e.message || e) }));
}
async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
  const total = +res.headers.get("content-length") || 0;
  if (!res.body || !res.body.getReader) { const b = await res.arrayBuffer(); onBytes(b.byteLength, total || b.byteLength); return b; }
  const rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes(got, total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}
async function browserDownload() {
  const base = window.__TAMA_LOCAL_BASE__ || TAMA_BASE;
  const buf = await fetchWithProgress(base + "pack.json", (g, t) => window.__tamaProgress({ phase: "pack", done: g, total: t, file: "pack.json" }));
  const text = new TextDecoder().decode(buf);
  const pack = JSON.parse(text);
  const files = pack.assets || [];
  for (let i = 0; i < files.length; i++) {
    await fetchWithProgress(base + files[i], () => {});
    window.__tamaProgress({ phase: "assets", done: i + 1, total: files.length, file: files[i] });
  }
  try { localStorage.setItem("ct-tama-pack", text); } catch (e) {}
  window.__tamaDone({ ok: true, pack: text });
}
window.__tamaProgress = (p) => { if (!tamaDl) return; Object.assign(tamaDl, p); if (sheetRender === renderTama) renderTama(); };
window.__tamaDone = (r) => {
  if (!r.ok) { tamaDl = { ...(tamaDl || {}), error: r.error || "알 수 없는 오류" }; renderTama(); return; }
  let pack = null, err = "";
  try { pack = typeof r.pack === "string" ? JSON.parse(r.pack) : r.pack; err = TamaEngine.validatePack(pack); } catch (e) { err = "받은 파일을 읽을 수 없어요."; }
  if (err) { tamaDl = { ...(tamaDl || {}), error: err }; renderTama(); return; }
  tamaPack = pack;
  state.tama.installed = true;
  state.tama.packVersion = pack.version;
  tamaDl = null;
  writeNow();
  toast("다마고치 모드를 받았어요!");
  tamaRender();
};

/* ── 켜기 / 끄기 ── */
let tamaAsk = null;                   // "goal" | "off"
function tamaEnable() {
  const min = tamaPack.config.minGoalMin;
  if (state.settings.goalMin < min && tamaAsk !== "goal") { tamaAsk = "goal"; renderTama(); return; }
  if (state.settings.goalMin < min) state.settings.goalMin = min;
  tamaAsk = null;
  TamaEngine.setEnabled(state.tama, true, tamaNow(), tamaPack);
  writeNow(); renderAll();
  closeSheet();
  toast(state.tama.pet ? "다마고치 모드를 다시 켰어요" : "다마고치 모드를 켰어요! 오른쪽 아래 둥지를 살펴보세요");
  tamaTick();
  if (state.tama.pet) tamaOpenPet(true);
}
function tamaDisable() {
  TamaEngine.setEnabled(state.tama, false, tamaNow(), tamaPack);
  tamaAsk = null;
  if (state.tama.winOpen) tamaOpenPet(false);
  writeNow(); renderAll(); tamaRender();
  toast("다마고치 모드를 껐어요. 배고픔 시간은 계속 흘러요");
}

/* ── 다마고치+ 시트 ── */
let tamaTab = "home";
const EGG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3.9 0 7 6 7 10.5A7 7 0 0 1 5 13.5C5 9 8.1 3 12 3z"/><path d="M8.5 12.5l2 1.5 2-2 2.5 2"/></svg>';
$("#openTama").onclick = () => { tamaTab = "home"; openSheet("다마고치+", renderTama); tamaTick(); };

function fmtAgo(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 ${h % 24}시간 전`;
}
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

function renderTama() {
  const T = state.tama;
  const box = $("#sheetBody");
  if (!tamaReady()) { $("#sheetExtra").innerHTML = ""; box.innerHTML = tamaIntroHTML(); return; }
  $("#sheetExtra").innerHTML = T.enabled ? `<div class="seg" role="tablist" aria-label="다마고치+">
      ${[["home", "내 펫"], ["dex", "도감"], ["farm", "농장"]].map(([k, l]) => `<button role="tab" data-ttab="${k}" aria-selected="${tamaTab === k}">${l}</button>`).join("")}
    </div>` : "";
  const d = TamaEngine.derive(T, tamaCtx());
  if (!T.enabled) { box.innerHTML = tamaOffHTML(); return; }
  if (tamaTab === "dex") box.innerHTML = TamaUI.dexHTML(T, tamaPack, d);
  else if (tamaTab === "farm") box.innerHTML = TamaUI.farmHTML(T, tamaPack);
  else box.innerHTML = tamaHomeHTML(d);
}

function tamaIntroHTML() {
  const dl = tamaDl;
  const sample = ["trike", "rex", "bronto", "ptera", "stego"].map((id) => tamaPack ? null : id);
  const pct = dl && dl.total ? Math.round(dl.done / dl.total * 100) : 0;
  let action;
  if (dl && dl.error) action = `<div class="tama-err">받지 못했어요: ${esc(dl.error)}<br><small>인터넷 연결을 확인하고 다시 시도해 주세요.</small></div><button class="btn primary" data-tama="download">다시 시도</button>`;
  else if (dl) action = `<div class="tama-dl"><div class="tama-dl-bar"><i style="width:${dl.phase === "assets" ? 30 + pct * 0.7 : pct * 0.3}%"></i></div>
      <div class="hint num">${dl.phase === "assets" ? `그림 받는 중 ${dl.done}/${dl.total}` : `공룡 정보 받는 중${dl.total ? ` ${Math.round(dl.done / 1024)}KB / ${Math.round(dl.total / 1024)}KB` : "…"}`}</div></div>`;
  else action = `<button class="btn primary" data-tama="download">다마고치 모드 받기</button><div class="hint">공룡 24종 정보와 그림을 한 번만 내려받아요.</div>`;
  return `<div class="tama-intro">
    <div class="tama-hero">${["#fff4dc", "#dff1ff", "#ffe1ec"].map((c, i) => `<div class="tama-hero-egg" style="--i:${i}">${TamaArt.eggSVG({ color: c, spot: ["#ffb37e", "#7fb7ff", "#ff8fb1"][i], pattern: ["dots", "zigzag", "hearts"][i], size: 1, tilt: [-8, 0, 8][i] })}</div>`).join("")}</div>
    <h3>공부로 키우는 아기 공룡</h3>
    <ol class="tama-steps">
      <li><b>둥지에서 알 훔치기</b><span>3~5개 알 중 하나를 골라요</span></li>
      <li><b>목표 5일 채우면 부화</b><span>하루 목표를 채운 날마다 1일</span></li>
      <li><b>공부해서 코인 · 경험치</b><span>10분에 1코인, 1분에 1경험치</span></li>
      <li><b>먹이 주고 키우기</b><span>3일(72시간) 굶으면 떠나요</span></li>
      <li><b>도감 · 농장</b><span>성체는 농장으로, 새 알을 찾아요</span></li>
    </ol>
    <div class="tama-action">${action}</div></div>`;
}

function tamaOffHTML() {
  const min = tamaPack.config.minGoalMin, cur = state.settings.goalMin;
  const ask = tamaAsk === "goal" ? `<div class="tama-ask"><p>다마고치 모드는 하루 목표 공부 시간이 최소 ${fmtDur(min * 60)}으로 설정됩니다.</p>
      <small>지금 목표 ${fmtDur(cur * 60)} → ${fmtDur(min * 60)}</small>
      <div class="tama-ask-btns"><button class="btn" data-tama="cancel">취소</button><button class="btn primary" data-tama="enable">확인</button></div></div>` : "";
  return `<div class="tama-intro">
    <div class="tama-hero">${TamaArt.eggSVG({ color: "#e7f8d6", spot: "#8ccf72", pattern: "leaves", size: 1, tilt: 0 })}</div>
    <h3>다마고치 모드 준비 완료</h3>
    <p class="hint">켜면 오른쪽 아래에 둥지가 나타나요. 모드가 켜져 있는 동안의 공부만 코인·부화·경험치로 쳐요.</p>
    ${state.tama.pet ? `<p class="hint">키우던 친구가 기다리고 있어요. 모드를 꺼 둔 동안에도 배고픔 시간은 흘렀어요.</p>` : ""}
    <div class="tama-action">${ask || `<button class="btn primary" data-tama="enable">다마고치 모드 활성화</button>`}</div></div>`;
}

function tamaHomeHTML(d) {
  const T = state.tama, p = T.pet;
  let petBox;
  if (!p) petBox = `<div class="tama-card tama-empty">${TamaArt.nestSVG()}<p>둥지에서 알을 골라 주세요</p><button class="btn primary" data-tama="toNest">둥지 보기</button></div>`;
  else {
    const sp = d.species, stage = p.stage;
    const art = stage === "egg" ? TamaArt.eggSVG(p.look) : TamaArt.petArt(tamaPack, sp, stage);
    const line = stage === "egg" ? `부화까지 ${d.egg.count}/${d.egg.need}일 · 오늘 ${fmtDur(d.egg.todaySec)} / ${fmtDur(d.goalSec)}`
      : p.dead ? "떠났어요" : `${TamaEngine.STAGE_LABEL[stage]} · 경험치 ${d.xp.xp}${d.xp.next ? ` / ${d.xp.next}` : ""} · 마지막 급식 ${fmtAgo(tamaNow() - p.lastFedAt)}`;
    petBox = `<div class="tama-card"><div class="tama-mini-art">${art}</div><div><b>${esc(stage === "egg" ? "알" : p.name)}</b><div class="hint">${line}</div></div>
      <button class="btn primary" data-tama="openPet">펫 창 열기</button></div>`;
  }
  const c = d.coins;
  return `<div class="tama-home">
    ${petBox}
    <div class="tama-stats">
      <div><span class="hint">코인</span><b class="num">${Math.max(0, c.balance)}</b><small class="hint">다음 코인까지 ${Math.ceil(c.nextCoinSec / 60)}분</small></div>
      <div><span class="hint">도감</span><b class="num">${d.dexProgress.got} / ${d.dexProgress.total}</b><small class="hint">${Math.round(d.dexProgress.got / d.dexProgress.total * 100)}%</small></div>
      <div><span class="hint">농장</span><b class="num">${T.farm.length}마리</b><small class="hint">성체가 된 친구들이 지내요</small></div>
    </div>
    <div class="set-row"><span>다마고치 모드<small class="hint" style="display:block;margin-top:2px">꺼도 펫의 배고픔 시간은 계속 흘러요</small></span>
      ${tamaAsk === "off" ? `<span class="tama-ask-btns"><button class="btn" data-tama="cancel">취소</button><button class="btn" data-tama="disable">끄기</button></span>` : `<button class="soft" data-tama="askOff">끄기</button>`}</div>
  </div>`;
}

$("#sheetBody").addEventListener("click", (e) => {
  if (sheetRender !== renderTama) return;
  const b = e.target.closest("[data-tama]");
  if (!b) return;
  const k = b.dataset.tama;
  if (k === "download") { if (!tamaDl || tamaDl.error) tamaDownload(); }
  else if (k === "enable") tamaEnable();
  else if (k === "cancel") { tamaAsk = null; renderTama(); }
  else if (k === "askOff") { tamaAsk = "off"; renderTama(); }
  else if (k === "disable") tamaDisable();
  else if (k === "openPet") { closeSheet(); tamaOpenPet(true); }
  else if (k === "toNest") { closeSheet(); renderNest(true); }
});
$("#sheetExtra").addEventListener("click", (e) => {
  if (sheetRender !== renderTama) return;
  const b = e.target.closest("[data-ttab]");
  if (b) { tamaTab = b.dataset.ttab; renderTama(); }
});

/* ── 둥지(오른쪽 아래) ── */
let nestPick = null, nestBusy = false;
function renderNest(show) {
  const el = $("#nest"), appEl = $("#app");
  if (!el) return;
  show = !!show && tamaReady() && state.tama.enabled && !state.tama.pet;
  appEl.classList.toggle("nesting", show);
  el.hidden = !show;
  if (!show) { nestPick = null; return; }
  const N = state.tama.nest;
  const key = N ? N.at + ":" + nestPick : "empty";
  if (el.dataset.key === key) return;            // 바뀐 게 없으면 다시 그리지 않아요(애니메이션 유지)
  el.dataset.key = key;
  const eggs = N ? N.eggs : [];
  const nestArt = tamaAsset("ui/nest.png") ? `<img class="nest-img" src="${tamaAsset("ui/nest.png")}" alt="" draggable="false">` : TamaArt.nestSVG();
  el.innerHTML = `
    <div class="nest-head"><h3>${eggs.length ? "어떤 알을 데려갈까요?" : "공룡 둥지"}</h3>
      <span class="hint">${eggs.length ? "엄마 공룡이 깨기 전에 하나만!" : "엄마 공룡이 낮잠 자는 중… 쉿!"}</span></div>
    <div class="nest-stage ${eggs.length ? "has-eggs" : ""} ${tamaAsset("ui/nest.png") ? "img" : ""}">
      <div class="nest-leaves l1"></div><div class="nest-leaves l2"></div>
      <div class="nest-eggs">${eggs.map((g, i) => `<button class="nest-egg ${nestPick === g.id ? "picked" : ""} ${nestPick && nestPick !== g.id ? "faded" : ""}" data-egg="${g.id}" style="--i:${i}" aria-label="${i + 1}번 알">${TamaArt.eggSVG(g.look, { dim: !!(nestPick && nestPick !== g.id) })}</button>`).join("")}</div>
      <div class="nest-art">${nestArt}</div>${tamaAsset("ui/nest.png") ? `<div class="nest-art front" aria-hidden="true">${nestArt}</div>` : ""}
      <div class="nest-zz" aria-hidden="true">z<span>z</span><span>z</span></div>
    </div>
    <div class="nest-foot">${eggs.length
      ? (nestPick ? `<span>이 알로 할까요? 고르면 바꿀 수 없어요.</span><span class="nest-btns"><button class="btn" data-nest="back">다시 보기</button><button class="btn primary" data-nest="take">데려가기</button></span>`
                  : `<span class="hint">알을 눌러서 골라요 · ${eggs.length}개</span>`)
      : `<span class="hint">알 3~5개 중 하나를 데려와 키워요</span><button class="btn primary" data-nest="steal">알 훔치기</button>`}</div>`;
}
$("#nest").addEventListener("click", (e) => {
  if (nestBusy) return;
  const egg = e.target.closest("[data-egg]");
  if (egg) { nestPick = egg.dataset.egg; $("#nest").classList.add("still"); renderNest(true); return; }
  const b = e.target.closest("[data-nest]");
  if (!b) return;
  const k = b.dataset.nest;
  if (k === "steal") {
    nestBusy = true;
    $("#nest").classList.add("sneak");                     // 살금살금 → 수풀 흔들 → 알 등장
    setTimeout(() => {
      const r = TamaEngine.act(state.tama, { type: "steal" }, tamaCtx());
      $("#nest").classList.remove("sneak");
      nestBusy = false;
      if (!r.ok) { toast(r.msg); return; }
      $("#nest").classList.remove("still");
      writeNow(); renderNest(true);
      $("#nest").classList.add("pop"); setTimeout(() => $("#nest").classList.remove("pop"), 900);
    }, 1100);
  } else if (k === "back") { nestPick = null; renderNest(true); }
  else if (k === "take" && nestPick) {
    nestBusy = true;
    const el = $(`#nest [data-egg="${nestPick}"]`);
    if (el) el.classList.add("taking");
    $("#nest").classList.add("leaving");
    setTimeout(() => {
      const r = TamaEngine.act(state.tama, { type: "choose", eggId: nestPick }, tamaCtx());
      $("#nest").classList.remove("leaving");
      nestBusy = false; nestPick = null;
      toast(r.msg);
      if (r.ok) { writeNow(); tamaRender(); tamaOpenPet(true); }
    }, 800);
  }
});

/* 목표 줄이기 막기(모드가 켜져 있을 때) */
function tamaGoalGuard(next) {
  const min = tamaMinGoal();
  if (next < min) { toast(`다마고치 모드가 켜져 있어서 하루 목표는 ${fmtDur(min * 60)}보다 줄일 수 없어요`); return false; }
  return true;
}

/* 시작 */
tamaTick();
setInterval(tamaTick, 5000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tamaTick(); });
if (tamaReady() && state.tama.enabled && state.tama.winOpen) setTimeout(() => tamaOpenPet(true), 600);
window.__tamaTest = { tick: tamaTick, setClock: (ms) => { window.__tamaClock = ms; tamaTick(); } };
