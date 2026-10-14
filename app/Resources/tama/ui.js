/* 다마고치+ 화면 조각: 도감 · 농장 · 추억(메인 시트와 펫 창이 같이 써요) + 펫 창 앱 */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
  const STAGES = [["baby", "아기"], ["teen", "아성체"], ["adult", "성체"]];
  const RARE_CLS = { common: "c", rare: "r", special: "s" };
  const art = (pack, sp, st, o) => root.TamaArt.petArt(pack, sp, st, o);
  const J = (w, p) => root.TamaEngine.josa(w, p);

  function dexHTML(T, pack, d) {
    const got = d.dexProgress.got, total = d.dexProgress.total;
    const cards = pack.species.map((sp, i) => {
      const rec = T.dex[sp.id] || {};
      const known = STAGES.some(([k]) => rec[k]);
      const slots = STAGES.map(([k, l]) => rec[k]
        ? `<div class="dex-slot on" title="${esc(l)} · ${fmtDate(rec[k])} 처음 만남">${art(pack, sp, k)}<span>${l}</span><small>${fmtDate(rec[k])}</small></div>`
        : `<div class="dex-slot"><div class="dex-lock">${art(pack, sp, k, { silhouette: true })}</div><span>${l}</span><small>?</small></div>`).join("");
      return `<div class="dex-card ${known ? "known" : ""}">
        <div class="dex-head"><span class="dex-no num">${String(i + 1).padStart(2, "0")}</span><b>${known ? esc(sp.name) : "???"}</b>
          <i class="rare ${RARE_CLS[sp.rarity] || "c"}">${esc((pack.rarity[sp.rarity] || {}).label || "")}</i></div>
        <div class="dex-slots">${slots}</div>
        <p class="dex-desc">${known ? esc(sp.desc) : "아직 만나지 못한 공룡이에요."}</p></div>`;
    }).join("");
    return `<div class="dex">
      <div class="dex-top"><div><b class="num">${got} / ${total}</b><span class="hint"> 단계 발견</span></div>
        <div class="dex-bar"><i style="width:${(got / total * 100).toFixed(1)}%"></i></div><span class="hint num">${Math.round(got / total * 100)}%</span></div>
      <div class="dex-grid">${cards}</div></div>`;
  }

  function farmHTML(T, pack) {
    if (!T.farm.length) return `<div class="tama-empty-msg">${root.TamaArt.nestSVG()}<p>아직 농장에 간 친구가 없어요.<br><small>성체가 된 친구를 농장으로 보내면 여기서 지내요.</small></p></div>`;
    const farmBg = root.TamaArt.assetFor && root.TamaArt.assetFor("ui/farm.png");
    return `<div class="farm">
      <div class="farm-field${farmBg ? " has-img" : ""}"${farmBg ? ` style="background-image:url('${esc(farmBg)}')"` : ""}>${T.farm.map((f, i) => { const sp = root.TamaEngine.speciesOf(pack, f.species); return `<div class="farm-pet" style="--i:${i}">${art(pack, sp, "adult")}</div>`; }).join("")}</div>
      <div class="farm-list">${T.farm.slice().reverse().map((f) => { const sp = root.TamaEngine.speciesOf(pack, f.species);
        return `<div class="farm-row"><div class="farm-thumb">${art(pack, sp, "adult")}</div><div><b>${esc(f.name)}</b><div class="hint">${esc(sp ? sp.name : f.species)} · ${fmtDate(f.movedAt)} 농장 이동 · 애정 ${f.love || 0}</div></div><code class="farm-id">#${esc(String(f.id).slice(0, 6))}</code></div>`; }).join("")}</div></div>`;
  }

  function gravesHTML(T, pack) {
    if (!T.graves.length) return `<div class="tama-empty-msg"><p>떠난 친구가 없어요.<br><small>마지막 급식 후 72시간이 지나면 펫이 떠나요.</small></p></div>`;
    return `<div class="farm-list">${T.graves.slice().reverse().map((g) => { const sp = root.TamaEngine.speciesOf(pack, g.species);
      return `<div class="farm-row grave"><div class="farm-thumb">${art(pack, sp, g.stage === "egg" ? "baby" : g.stage, { silhouette: false })}</div><div><b>${esc(g.name)}</b><div class="hint">${esc(sp ? sp.name : g.species)} · ${({ baby: "아기", teen: "아성체", adult: "성체" })[g.stage] || ""} · ${fmtDate(g.diedAt)}에 떠났어요</div></div></div>`; }).join("")}</div>`;
  }

  /* ───────── 펫 창 앱 ───────── */
  const ICON = {
    pet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10.5c0-3.3 2.2-6 5-6s5 2.7 5 6v2.5c0 3.6-2.2 6.5-5 6.5s-5-2.9-5-6.5z"/><path d="M9.6 11.2h.01M14.4 11.2h.01M10.5 14.5c1 .7 2 .7 3 0"/><path d="M8 6.5L6 4M16 6.5L18 4"/></svg>',
    food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5h16a8 8 0 0 1-16 0z"/><path d="M8 9c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5M12 4v2.5"/></svg>',
    dex: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.2 5 7.6 4.5 4 5v13c3.6-.5 6.2 0 8 1.5 1.8-1.5 4.4-2 8-1.5V5c-3.6-.5-6.2 0-8 1.5zM12 6.5v13"/></svg>',
    farm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5L12 4l8.5 6.5V20h-17z"/><path d="M9 20v-6h6v6M9 14l6 6M15 14l-6 6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor"/></svg>',
  };
  const coinSVG = '<svg viewBox="0 0 24 24" class="coin-ic"><circle cx="12" cy="12" r="10" fill="#f6c343"/><circle cx="12" cy="12" r="7.2" fill="#ffd96a" stroke="#e0a526" stroke-width="1.4"/><path d="M12 8.2v7.6M9.8 10h3.6a1.6 1.6 0 0 1 0 3.2h-2.8" stroke="#c88a12" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
  const FOOD_ART = {
    snack: '<svg viewBox="0 0 48 48"><path d="M24 6l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L24 29.6l-9.3 4.9 1.8-10.3L9 16.9l10.4-1.5z" fill="#ffd3e6" stroke="#e78ab3" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="20" r="2" fill="#fff"/></svg>',
    meal: '<svg viewBox="0 0 48 48"><path d="M7 24h34a17 13 0 0 1-34 0z" fill="#8fc7ff" stroke="#4a8ad0" stroke-width="2.4"/><path d="M11 24c0-6 6-10 13-10s13 4 13 10" fill="#fffaf0" stroke="#d9c7a3" stroke-width="2.2"/><path d="M18 16q2-4 0-7M26 15q2-4 0-7" stroke="#c9b9a0" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    feast: '<svg viewBox="0 0 48 48"><path d="M8 26h32v13H8z" fill="#ffe2ec" stroke="#e37fa2" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 26c3 3 5 3 8 0s5-3 8 0 5 3 8 0 5-3 8 0" fill="none" stroke="#fff" stroke-width="3"/><path d="M10 26q14-10 28 0" fill="#ff9ec0" stroke="#e37fa2" stroke-width="2.4"/><path d="M24 12v8" stroke="#ffcf5a" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="10" r="2.6" fill="#ff8a3d"/></svg>',
  };
  const HUNGER = { full: ["배부름", "ok"], hungry: ["배고픔", "warn"], very: ["매우 배고픔", "bad"], dead: ["떠남", "dead"] };

  function mountPet(rootEl, send) {
    let D = null, recvAt = 0, tab = "pet", editing = false, pending = new Set(), confirmFarm = false, lastShown = null;
    const nowMs = () => (D ? D.now + (Date.now() - recvAt) : Date.now());
    const go = (a) => {
      const key = a.type + ":" + (a.food || a.eggId || "");
      if (pending.has(key)) return;                // 응답 오기 전 같은 동작 막기(빠른 연속 클릭)
      pending.add(key);
      a.actId = Math.random().toString(36).slice(2, 10);
      a.key = key;
      send(a);
      setTimeout(() => pending.delete(key), 1500);
    };
    const toastEl = document.createElement("div"); toastEl.className = "p-toast";
    let toastT;
    const toast = (m) => { if (!m) return; toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 2400); };

    function render() {
      if (!D || !D.pack) { rootEl.innerHTML = `<div class="p-wait">불러오는 중…</div>`; return; }
      root.TamaArt.imageFor = (sp, st) => { const p = sp.img && sp.img[st]; return p && (D.pack.assets || []).includes(p) ? D.assetBase + p : null; };
      root.TamaArt.assetFor = (p) => (p && (D.pack.assets || []).includes(p) ? D.assetBase + p : null);
      const T = D.tama, d = D.derived, pack = D.pack, p = T.pet, sp = d && d.species;
      const coins = Math.max(0, d.coins.balance);
      const stage = p ? p.stage : null;
      const title = !p ? "빈 둥지" : stage === "egg" ? "수수께끼 알" : p.name;
      const chip = !p ? "" : p.dead ? `<span class="p-chip dead">떠남</span>` : `<span class="p-chip">${({ egg: "알", baby: "아기", teen: "아성체", adult: "성체" })[stage]}</span>`;
      const avatar = !p ? "" : stage === "egg" ? root.TamaArt.eggSVG(p.look) : art(pack, sp, stage);
      const head = `<header class="p-head">
        <div class="p-ava">${avatar}</div>
        <div class="p-id">${editing && p && stage !== "egg" ? `<input class="p-name-in" id="pName" maxlength="${pack.config.nameMax || 10}" value="${esc(p.name)}" aria-label="펫 이름">`
          : `<b class="p-name">${esc(title)}</b>${p && stage !== "egg" && !p.dead ? `<button class="p-pen" data-p="edit" title="이름 바꾸기" aria-label="이름 바꾸기">${ICON.pencil}</button>` : ""}`}
          <div class="p-sub">${chip}${sp && stage !== "egg" ? `<span class="p-sp">${esc(sp.name)}</span>` : ""}</div></div>
        <div class="p-coin" title="공부 10분마다 1코인">${coinSVG}<b class="num">${coins.toLocaleString()}</b></div></header>`;
      let body = "";
      if (tab === "pet") body = petTab(T, d, pack, p, sp);
      else if (tab === "food") body = foodTab(T, d, pack, p, coins);
      else if (tab === "dex") body = `<div class="p-scroll">${dexHTML(T, pack, d)}</div>`;
      else body = `<div class="p-scroll">${farmHTML(T, pack)}${T.graves.length ? `<h4 class="p-h4">떠난 친구들</h4>${gravesHTML(T, pack)}` : ""}</div>`;
      const nav = `<nav class="p-nav">${[["pet", "펫"], ["food", "먹이"], ["dex", "도감"], ["farm", "농장"]].map(([k, l]) =>
        `<button class="p-tab ${tab === k ? "on" : ""}" data-tab="${k}"><span>${ICON[k]}</span><small>${l}</small></button>`).join("")}</nav>`;
      rootEl.innerHTML = head + `<main class="p-main">${body}</main>` + nav + fxHTML(T, pack) + farmConfirmHTML(p, sp, pack);
      rootEl.appendChild(toastEl);
      const inp = rootEl.querySelector("#pName");
      if (inp) { inp.focus(); inp.select(); }
    }

    function screen(inner, cls = "") {
      const bg = D.pack.assets && D.pack.assets.includes("ui/meadow.png") ? `style="background-image:url('${D.assetBase}ui/meadow.png')"` : "";
      return `<div class="p-screen ${cls}" ${bg}><div class="p-sky"></div>${inner}</div>`;
    }

    function petTab(T, d, pack, p, sp) {
      if (!p) return screen(`<div class="p-nest">${root.TamaArt.nestSVG()}</div>`, "empty") +
        `<div class="p-card center"><p>지금 키우는 친구가 없어요.</p><button class="p-btn primary" data-p="goSteal">둥지에서 알 고르기</button></div>`;
      if (p.stage === "egg") {
        const e = d.egg;
        const dots = Array.from({ length: e.need }, (_, i) => `<i class="${i < e.count ? "on" : ""}"></i>`).join("");
        const frac = Math.min(1, e.todaySec / d.goalSec);
        return screen(`<div class="p-pet egg ${e.count >= e.need - 1 ? "soon" : ""}">${root.TamaArt.eggSVG(p.look)}</div>`) +
          `<div class="p-card">
            <div class="p-row"><span>부화 진행</span><b class="num">${e.count} / ${e.need}일</b></div>
            <div class="p-dots">${dots}</div>
            <div class="p-row"><span>오늘 공부</span><b class="num">${fmtHM(e.todaySec)} / ${fmtHM(d.goalSec)}</b></div>
            <div class="p-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>
            <div class="p-row"><span class="p-met ${e.todayMet ? "ok" : ""}">${e.todayMet ? "오늘 목표 달성! 알이 따뜻해졌어요" : "오늘 목표를 채우면 1일이 올라가요"}</span></div>
            <p class="p-note">알을 데려온 뒤 하루 목표를 채운 날마다 1일씩, 모두 5일을 채우면 부화해요. 연속이 아니어도 되고, 못 채운 날도 줄어들지 않아요.</p>
          </div>`;
      }
      if (p.dead) {
        return screen(`<div class="p-pet dead">${art(pack, sp, p.stage)}</div><div class="p-stars">✦ ✧ ✦</div>`, "night") +
          `<div class="p-card center"><b>${esc(J(p.name, "이가"))} 떠났어요</b><p class="p-note">마지막 급식 뒤 72시간이 지나 별이 되었어요. 도감 기록은 그대로 남아요.</p>
            <button class="p-btn primary" data-p="release">새 알 찾으러 가기</button></div>`;
      }
      const x = d.xp, h = d.hunger, hl = HUNGER[h.level] || HUNGER.full;
      const hearts = Math.min(5, Math.floor((p.love || 0) / 6) + ((p.love || 0) > 0 ? 1 : 0));
      const mood = h.level === "full" ? "happy" : h.level === "hungry" ? "meh" : "sad";
      return screen(`<div class="p-pet ${mood}">${art(pack, sp, p.stage)}</div>${h.level === "very" ? `<div class="p-bubble">배고파요…</div>` : ""}`) +
        `<div class="p-card">
          <div class="p-row"><span>경험치 <b class="num">${x.xp}${x.next ? ` / ${x.next}` : ""}</b></span>
            <span class="p-hunger ${hl[1]}">${ICON.heart}${hl[0]}</span></div>
          <div class="p-bar xp"><i style="width:${(x.frac * 100).toFixed(1)}%"></i></div>
          <div class="p-row small"><span>${x.next ? `다음 성장까지 ${x.toNext}XP` : "다 자랐어요!"}</span><span>마지막 급식 ${ago(nowMs() - p.lastFedAt)}</span></div>
          ${h.level === "very" ? `<div class="p-warn">${Math.ceil(h.leftHours)}시간 안에 먹이를 주지 않으면 떠나요!</div>` : ""}
          <div class="p-row"><span>애정도</span><span class="p-hearts">${Array.from({ length: 5 }, (_, i) => `<i class="${i < hearts ? "on" : ""}">${ICON.heart}</i>`).join("")}</span></div>
          ${p.stage === "adult" ? `<button class="p-btn primary wide" data-p="farm">농장에 보내기</button>` : `<button class="p-btn wide" data-tab="food">먹이 주기</button>`}
        </div>`;
    }

    function foodTab(T, d, pack, p, coins) {
      const canFeed = p && p.stage !== "egg" && !p.dead;
      const inv = pack.foods.map((f) => {
        const n = T.inventory[f.id] || 0;
        return `<div class="p-food"><div class="p-food-art">${foodArt(f)}</div><div class="p-food-txt"><b>${esc(f.name)} <span class="num">× ${n}</span></b><small>애정 +${f.love}</small></div>
          <button class="p-btn ${canFeed && n ? "primary" : ""}" data-feed="${f.id}" ${canFeed && n ? "" : "disabled"} title="${!canFeed ? (p && p.stage === "egg" ? "알은 아직 먹지 않아요" : "먹이를 줄 친구가 없어요") : n ? "" : "가진 먹이가 없어요"}">먹이기</button></div>`;
      }).join("");
      const shop = pack.foods.map((f) => {
        const lack = f.price - coins;
        return `<div class="p-food"><div class="p-food-art">${foodArt(f)}</div><div class="p-food-txt"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div>
          <button class="p-btn buy ${lack > 0 ? "" : "primary"}" data-buy="${f.id}" ${lack > 0 ? "disabled" : ""}>${coinSVG}<span class="num">${f.price}</span></button>
          ${lack > 0 ? `<em class="p-lack">${lack}코인 모자라요</em>` : ""}</div>`;
      }).join("");
      return `<div class="p-scroll">
        <h4 class="p-h4">가방 <small>먹이를 사도 급식 시간은 그대로예요. 먹였을 때만 바뀌어요.</small></h4>${inv}
        <h4 class="p-h4">상점 <small>공부 10분 = 1코인 · 목표 달성한 날 +${pack.config.goalBonusCoins}</small></h4>${shop}
        <p class="p-note">다음 코인까지 공부 ${Math.ceil(d.coins.nextCoinSec / 60)}분</p></div>`;
    }
    const foodArt = (f) => (D.pack.assets || []).includes(`ui/food_${f.id}.png`) ? `<img src="${D.assetBase}ui/food_${f.id}.png" alt="">` : (FOOD_ART[f.id] || FOOD_ART.snack);

    function fxHTML(T, pack) {
      const fx = (T.fx || [])[0];
      if (!fx) return "";
      const p = T.pet, sp = p ? root.TamaEngine.speciesOf(pack, p.species) : null;
      if (fx.type === "hatch" && sp) {
        const rar = pack.rarity[sp.rarity] || {};
        return `<div class="p-fx hatch"><div class="fx-burst"></div>
          <div class="fx-egg">${root.TamaArt.eggSVG(p.look, { crack: true })}</div>
          <div class="fx-pet">${art(pack, sp, "baby")}</div>
          <div class="fx-txt"><i class="rare ${RARE_CLS[sp.rarity]}">${esc(rar.label || "")}</i><h3>${esc(J(sp.name, "이가"))} 태어났어요!</h3><p>${esc(sp.desc)}</p>
            <button class="p-btn primary" data-ack="${fx.id}">만나서 반가워!</button></div></div>`;
      }
      if (fx.type === "grow" && sp) return `<div class="p-fx grow"><div class="fx-burst"></div><div class="fx-pet">${art(pack, sp, fx.stage)}</div>
          <div class="fx-txt"><h3>${esc(J(p.name, "이가"))} ${fx.stage === "teen" ? "아성체" : "성체"}로 자랐어요!</h3><p>도감에 새 모습이 기록됐어요.</p>
          <button class="p-btn primary" data-ack="${fx.id}">좋아요</button></div></div>`;
      const bye = root.TamaArt.assetFor && root.TamaArt.assetFor("ui/farewell.png");
      if (fx.type === "died") return `<div class="p-fx died">${bye ? `<div class="fx-pet farewell"><img src="${esc(bye)}" alt=""></div>` : ""}<div class="fx-txt"><h3>친구가 떠났어요</h3><p>마지막 급식 뒤 72시간이 지났어요. 새 알을 찾아 다시 시작할 수 있어요.</p>
          <button class="p-btn primary" data-ack="${fx.id}">확인</button></div></div>`;
      return `<div class="p-fx"><div class="fx-txt"><button class="p-btn" data-ack="${fx.id}">확인</button></div></div>`;
    }
    function farmConfirmHTML(p, sp, pack) {
      if (!confirmFarm || !p || p.stage !== "adult" || p.dead) return "";
      return `<div class="p-fx farm-ask"><div class="fx-pet">${art(pack, sp, "adult")}</div><div class="fx-txt"><h3>${esc(J(p.name, "을를"))} 농장에 보낼까요?</h3>
        <p>농장에서는 배고프지 않고 평화롭게 지내요. 다시 데려올 수는 없고, 육성 칸이 비어서 새 알을 고를 수 있어요.</p>
        <div class="fx-btns"><button class="p-btn" data-p="farmNo">취소</button><button class="p-btn primary" data-p="farmYes">보내기</button></div></div></div>`;
    }

    rootEl.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab],[data-p],[data-feed],[data-buy],[data-ack]");
      if (!t || t.disabled) return;
      if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
      if (t.dataset.ack) { send({ type: "ack", fxId: t.dataset.ack }); D.tama.fx = D.tama.fx.filter((x) => x.id !== t.dataset.ack); render(); return; }
      if (t.dataset.feed) { t.disabled = true; go({ type: "feed", food: t.dataset.feed }); return; }
      if (t.dataset.buy) { t.disabled = true; go({ type: "buy", food: t.dataset.buy, qty: 1 }); return; }
      const k = t.dataset.p;
      if (k === "edit") { editing = true; render(); }
      else if (k === "farm") { confirmFarm = true; render(); }
      else if (k === "farmNo") { confirmFarm = false; render(); }
      else if (k === "farmYes") { confirmFarm = false; go({ type: "toFarm" }); }
      else if (k === "release") { go({ type: "release" }); setTimeout(() => send({ type: "goSteal" }), 300); }
      else if (k === "goSteal") send({ type: "goSteal" });
    });
    rootEl.addEventListener("keydown", (e) => {
      if (e.target.id !== "pName") return;
      if (e.key === "Enter") { editing = false; go({ type: "rename", name: e.target.value }); }
      else if (e.key === "Escape") { editing = false; render(); }
    });
    rootEl.addEventListener("focusout", (e) => { if (e.target.id === "pName" && editing) { editing = false; go({ type: "rename", name: e.target.value }); } });

    return {
      sync(data) {
        D = data; recvAt = Date.now();
        if (data.last && data.last.actId && data.last.actId !== lastShown) {
          lastShown = data.last.actId;
          toast(data.last.msg);
          pending.clear();
          if (data.last.ok && data.last.type === "feed") rootEl.classList.add("fed"), setTimeout(() => rootEl.classList.remove("fed"), 900);
        }
        if (editing) return;              // 이름 고치는 중에는 다시 그리지 않아요
        render();
      },
      render,
      tick() { if (!editing && !confirmFarm) render(); },
    };
  }
  function fmtHM(sec) { const m = Math.floor(sec / 60), h = Math.floor(m / 60); return h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`; }
  function ago(ms) { const m = Math.max(0, Math.floor(ms / 60000)); if (m < 1) return "방금"; if (m < 60) return `${m}분 전`; const h = Math.floor(m / 60); return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 ${h % 24}시간 전`; }

  root.TamaUI = { dexHTML, farmHTML, gravesHTML, mountPet, fmtHM };
})(typeof window !== "undefined" ? window : globalThis);
