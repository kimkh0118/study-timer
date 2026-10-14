/* 다마고치+ 규칙 엔진 — 화면 코드 없이 판정만 해요.
 * 부화 · 재화 · 경험치 · 성장 · 급식 · 굶주림/떠남 · 도감 · 농장을 모두 여기서 계산해요.
 * 수치(가격, 필요 경험치, 시간)는 팩(pack.json)의 config · foods · rarity · species에서 읽어요.
 * 모든 함수는 now(ms)를 받아서, 테스트에서 시계를 바꿔 끼울 수 있어요. */
(function (root) {
  const HOUR = 3600 * 1000;
  /* 받침에 맞는 조사: josa("뿌뿌", "이가") → "뿌뿌가" */
  function josa(word, pair) {
    const w = String(word || ""), c = w.charCodeAt(w.length - 1);
    const [a, b] = { 이가: ["이", "가"], 을를: ["을", "를"], 은는: ["은", "는"], 으로: ["으로", "로"], 과와: ["과", "와"] }[pair] || ["", ""];
    if (!(c >= 0xac00 && c <= 0xd7a3)) return w + b;
    const jong = (c - 0xac00) % 28;
    if (pair === "으로") return w + (jong && jong !== 8 ? a : b);
    return w + (jong ? a : b);
  }
  const STAGES = ["egg", "baby", "teen", "adult"];
  const STAGE_LABEL = { egg: "알", baby: "아기", teen: "아성체", adult: "성체" };

  function defaultState() {
    return {
      v: 1,
      installed: false,          // 리소스 팩을 받았는지
      packVersion: 0,
      enabled: false,
      ranges: [],                // 모드가 켜져 있던 구간 [{from, to|null}] — 이 안의 공부만 재화·부화·경험치로 쳐요
      spent: 0,                  // 상점에서 쓴 코인
      bonusDays: {},             // 목표 달성 보너스를 준 날짜 { "2026-10-14": 시각 }
      starterGiven: false,
      inventory: {},             // { snack: 2, ... }
      nest: null,                // { at, eggs: [{ id, species, look }] }  — 고르기 전 후보(다시 열어도 그대로)
      pet: null,                 // 지금 키우는 알/펫
      dex: {},                   // { speciesId: { baby: ms, teen: ms, adult: ms } } 처음 발견한 시각
      farm: [],                  // [{ id, species, name, movedAt, hatchedAt, love }]
      graves: [],                // [{ id, species, name, stage, hatchedAt, diedAt }]
      seen: {},                  // 이미 보여 준 이벤트(부화·성장 연출) 표시
      doneActs: [],              // 이미 처리한 동작 id(빠른 연속 클릭 중복 방지)
    };
  }

  /* 예전 데이터에도 안전하게: 빠진 칸만 채워요 */
  function migrate(t) {
    const d = defaultState();
    if (!t || typeof t !== "object") return d;
    for (const k of Object.keys(d)) if (t[k] === undefined) t[k] = d[k];
    if (!Array.isArray(t.ranges)) t.ranges = [];
    if (!Array.isArray(t.farm)) t.farm = [];
    t.graves = []; // 떠난 동물 기록은 보관하지 않아요.
    if (t.pet && t.pet.dead) t.pet = null;
    if (Array.isArray(t.fx)) t.fx = t.fx.filter(e => e.type !== "died");
    if (!Array.isArray(t.doneActs)) t.doneActs = [];
    return t;
  }

  const speciesOf = (pack, id) => (pack && pack.species || []).find((s) => s.id === id) || null;
  const foodOf = (pack, id) => (pack && pack.foods || []).find((f) => f.id === id) || null;

  /* 다마고치에 쓰는 공부 기록: 손으로 넣은 기록은 빼고, 모드가 켜져 있던 구간에 시작한 것만 */
  function inRanges(t, ms) {
    return t.ranges.some((r) => ms >= r.from && (r.to == null || ms < r.to));
  }
  function eligible(t, sessions, sinceMs) {
    return sessions.filter((s) => !s.manual && s.sec > 0 && s.start >= (sinceMs || 0) && inRanges(t, s.start));
  }
  function secByDay(list, dayKey) {
    const m = {};
    for (const s of list) { const k = dayKey(s.start); m[k] = (m[k] || 0) + s.sec; }
    return m;
  }

  /* 코인: (켜져 있던 동안의 공부 초 ÷ coinStudySec) + 목표 보너스 − 쓴 코인.
   * 기록에서 매번 다시 계산하니 같은 기록에 두 번 주지 않고, 10분이 안 되는 자투리는 다음 공부와 합쳐져요. */
  function coinInfo(t, ctx) {
    const cfg = ctx.pack.config;
    const list = eligible(t, ctx.sessions, 0);
    const sec = list.reduce((a, s) => a + s.sec, 0);
    const fromStudy = Math.floor(sec / cfg.coinStudySec);
    const bonus = Object.keys(t.bonusDays).length * (cfg.goalBonusCoins || 0);
    const remainSec = sec % cfg.coinStudySec;
    // kept: 기록을 지워서 줄어든 코인을 돌려 놓은 양(한 번 받은 코인은 기록을 지워도 그대로예요)
    const earned = fromStudy + bonus + (t.coinKept || 0);
    return { studySec: sec, fromStudy, bonus, raw: fromStudy + bonus, earned, balance: earned - t.spent, nextCoinSec: cfg.coinStudySec - remainSec, remainSec };
  }

  /* 경험치: 부화한 뒤의 공부 시간(분) */
  function xpOf(t, ctx) {
    const p = t.pet;
    if (!p || !p.hatchedAt) return 0;
    const list = eligible(t, ctx.sessions, p.hatchedAt);
    return Math.floor(list.reduce((a, s) => a + s.sec, 0) / ctx.pack.config.xpStudySec);
  }

  function hungerOf(p, now, cfg) {
    if (!p || p.stage === "egg" || p.dead) return null;
    const h = Math.max(0, (now - p.lastFedAt) / HOUR);
    let level = "full";
    if (h >= cfg.deathHours) level = "dead";
    else if (h >= cfg.veryHungryHours) level = "very";
    else if (h >= cfg.hungryHours) level = "hungry";
    return { hours: h, level, leftHours: Math.max(0, cfg.deathHours - h) };
  }

  function unlock(t, species, stage, now) {
    const d = (t.dex[species] = t.dex[species] || {});
    if (!d[stage]) d[stage] = now;            // 처음 발견한 날만 남기고 덮어쓰지 않아요
  }

  /* 상태 갱신: 앱을 켤 때 · 화면에 들어올 때 · 주기적으로 불러요. 생긴 일을 events로 돌려줘요. */
  function refresh(t, ctx) {
    const cfg = ctx.pack.config, now = ctx.now, events = [];
    if (!t.installed) return events;
    t.graves = [];
    if (t.pet && t.pet.dead) t.pet = null;

    // 0) 시계가 앞당겨져 있던 동안(테스트 리모컨) 만든 '미래' 구간을 지금으로 당겨요.
    //    안 그러면 시계를 되돌린 뒤 하는 공부가 켜진 구간 밖이라 코인이 안 들어와요.
    for (const r of t.ranges) {
      if (r.from > now) r.from = now;
      if (r.to != null && r.to > now) r.to = now;
    }
    // 0-1) 코인 장부: 기록이 지워져 번 코인이 줄면 그만큼 kept로 남겨서 잔액이 줄지 않게,
    //      그리고 예전 데이터에 남은 빚(쓴 코인 > 번 코인)은 없애서 새로 번 코인이 바로 잔액에 보이게 해요.
    //      (진행 중인 공부는 빼고, 저장된 기록만으로 계산해요 — 일시정지 때 두 번 쌓이지 않게)
    {
      const saved = { ...ctx, sessions: (ctx.sessions || []).filter((s) => !s.live) };
      const ci = coinInfo(t, saved);
      if (t.coinRaw != null && ci.raw < t.coinRaw) t.coinKept = (t.coinKept || 0) + (t.coinRaw - ci.raw);
      t.coinRaw = ci.raw;
      const ci2 = coinInfo(t, saved);
      if (t.spent > ci2.earned) t.spent = ci2.earned;
    }

    // 1) 목표 달성 보너스(하루 한 번)
    const all = eligible(t, ctx.sessions, 0);
    const byDay = secByDay(all, ctx.dayKey);
    for (const [k, sec] of Object.entries(byDay)) {
      if (sec >= ctx.goalSec && !t.bonusDays[k]) { t.bonusDays[k] = now; events.push({ type: "bonus", day: k, coins: cfg.goalBonusCoins }); }
    }

    const p = t.pet;
    if (!p) return events;

    // 2) 알: 고른 뒤 목표를 채운 날을 날짜별로 기록(같은 날 한 번, 목표를 바꿔도 취소 안 함)
    if (p.stage === "egg") {
      const mine = secByDay(eligible(t, ctx.sessions, p.chosenAt), ctx.dayKey);
      for (const [k, sec] of Object.entries(mine)) {
        if (sec >= ctx.goalSec && !p.hatchDays[k]) { p.hatchDays[k] = now; events.push({ type: "eggDay", day: k, count: Object.keys(p.hatchDays).length }); }
      }
      if (Object.keys(p.hatchDays).length >= cfg.hatchDays) {
        p.stage = "baby";
        p.hatchedAt = now;
        p.lastFedAt = now;                    // 부화 시각이 첫 급식 기준
        p.stageAt.baby = now;
        unlock(t, p.species, "baby", now);
        events.push({ type: "hatch", species: p.species });
      }
      return events;
    }

    // 3) 굶주림: 실제 흐른 시간으로(앱을 꺼 둔 시간·모드를 꺼 둔 시간 포함)
    if (!p.dead) {
      const hg = hungerOf(p, now, cfg);
      if (hg && hg.level === "dead") {
        p.dead = true;
        p.diedAt = p.lastFedAt + cfg.deathHours * HOUR;
        t.pet = null;
        events.push({ type: "died", species: p.species });
        return events;
      }
    } else return events;

    // 4) 성장: 경험치가 넘으면 다음 단계(한 번 오른 단계는 내려가지 않아요)
    const xp = xpOf(t, ctx);
    if (p.stage === "baby" && xp >= cfg.stageXp.teen) { p.stage = "teen"; p.stageAt.teen = now; unlock(t, p.species, "teen", now); events.push({ type: "grow", stage: "teen" }); }
    if (p.stage === "teen" && xp >= cfg.stageXp.adult) { p.stage = "adult"; p.stageAt.adult = now; unlock(t, p.species, "adult", now); events.push({ type: "grow", stage: "adult" }); }
    return events;
  }

  /* 화면에 보여 줄 값 */
  function derive(t, ctx) {
    const cfg = ctx.pack.config, now = ctx.now, p = t.pet;
    const coins = coinInfo(t, ctx);
    const today = ctx.dayKey(now);
    const out = { coins, today, goalSec: ctx.goalSec, stageLabel: STAGE_LABEL };
    const allToday = secByDay(eligible(t, ctx.sessions, 0), ctx.dayKey)[today] || 0;
    out.todaySec = allToday;
    if (p) {
      const sp = speciesOf(ctx.pack, p.species);
      out.species = sp;
      if (p.stage === "egg") {
        const mineToday = secByDay(eligible(t, ctx.sessions, p.chosenAt), ctx.dayKey)[today] || 0;
        out.egg = { count: Object.keys(p.hatchDays).length, need: cfg.hatchDays, todaySec: mineToday, todayMet: !!p.hatchDays[today] || mineToday >= ctx.goalSec };
      } else {
        const xp = xpOf(t, ctx);
        const next = p.stage === "baby" ? cfg.stageXp.teen : p.stage === "teen" ? cfg.stageXp.adult : null;
        const prev = p.stage === "baby" ? 0 : p.stage === "teen" ? cfg.stageXp.teen : cfg.stageXp.adult;
        out.xp = { xp, next, prev, toNext: next == null ? 0 : Math.max(0, next - xp), frac: next == null ? 1 : Math.max(0, Math.min(1, (xp - prev) / (next - prev))) };
        out.hunger = p.dead ? { level: "dead", hours: (now - p.lastFedAt) / HOUR, leftHours: 0 } : hungerOf(p, now, cfg);
      }
    }
    const total = (ctx.pack.species || []).length * 3;
    let got = 0;
    for (const d of Object.values(t.dex)) got += ["baby", "teen", "adult"].filter((s) => d[s]).length;
    out.dexProgress = { got, total };
    return out;
  }

  /* 알 후보 뽑기: 희귀도 가중치 → 그 안에서 고르게. 모양(색·무늬·크기)은 종과 무관하게 섞어서 종을 미리 알 수 없어요. */
  const EGG_COLORS = ["#fff4dc", "#dff1ff", "#ffe1ec", "#e7f8d6", "#ece3ff", "#d8f7ee", "#fff1b8", "#f4f4f4", "#ffe6cc", "#e2ecff"];
  const EGG_PATTERNS = ["dots", "stripes", "zigzag", "stars", "hearts", "waves", "speckle", "plain", "band", "leaves"];
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function pickSpecies(pack, r) {
    const rar = pack.rarity, keys = Object.keys(rar).filter((k) => pack.species.some((s) => s.rarity === k));
    const tot = keys.reduce((a, k) => a + rar[k].weight, 0);
    let x = r() * tot, rk = keys[0];
    for (const k of keys) { if ((x -= rar[k].weight) < 0) { rk = k; break; } }
    const pool = pack.species.filter((s) => s.rarity === rk);
    return pool[Math.floor(r() * pool.length)];
  }
  /* 종별 실제 등장 확률(설명·검증용) */
  function probabilities(pack) {
    const rar = pack.rarity, keys = Object.keys(rar).filter((k) => pack.species.some((s) => s.rarity === k));
    const tot = keys.reduce((a, k) => a + rar[k].weight, 0);
    const out = {};
    for (const s of pack.species) out[s.id] = rar[s.rarity].weight / tot / pack.species.filter((x) => x.rarity === s.rarity).length;
    return out;
  }

  const uid = (r) => Math.floor(r() * 2 ** 32).toString(36) + Date.now().toString(36).slice(-4);

  /* 동작 처리: 성공하면 { ok:true, msg, events }, 아니면 { ok:false, msg } */
  function act(t, a, ctx) {
    const cfg = ctx.pack.config, now = ctx.now;
    if (a.actId) {
      if (t.doneActs.includes(a.actId)) return { ok: false, dup: true, msg: "" };
      t.doneActs.push(a.actId);
      if (t.doneActs.length > 60) t.doneActs.splice(0, t.doneActs.length - 60);
    }
    const events = refresh(t, ctx);            // 동작 전에 항상 상태부터(이미 떠난 펫에게 먹이 주기 방지)
    const p = t.pet;
    const result = (() => { switch (a.type) {
      case "steal": {
        if (!t.enabled) return { ok: false, msg: "다마고치 모드를 먼저 켜 주세요." };
        if (p) return { ok: false, msg: p.dead ? "먼저 떠난 친구를 보내 주세요." : "지금 키우는 친구가 있어요." };
        if (t.nest && t.nest.eggs.length) return { ok: true, msg: "", events };     // 이미 고른 후보는 그대로
        const r = rng(a.seed != null ? a.seed : now);
        const [lo, hi] = cfg.eggCount;
        const n = lo + Math.floor(r() * (hi - lo + 1));
        const eggs = [];
        // 알 그림(팩의 ui/egg_N.png)은 한 둥지 안에서 겹치지 않게 섞어서 나눠요
        const arts = Array.from({ length: cfg.eggArts || 12 }, (_, i) => i);
        for (let i = arts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arts[i], arts[j]] = [arts[j], arts[i]]; }
        for (let i = 0; i < n; i++) {
          const sp = pickSpecies(ctx.pack, r);
          eggs.push({ id: uid(r), species: sp.id, rarity: sp.rarity,
            look: { color: EGG_COLORS[Math.floor(r() * EGG_COLORS.length)], spot: EGG_COLORS[Math.floor(r() * EGG_COLORS.length)],
                    pattern: EGG_PATTERNS[Math.floor(r() * EGG_PATTERNS.length)], size: +(0.86 + r() * 0.22).toFixed(2), tilt: Math.round(r() * 16 - 8),
                    art: arts[i % arts.length] } });
        }
        t.nest = { at: now, eggs };
        return { ok: true, msg: `알 ${n}개를 찾았어요!`, events };
      }
      case "choose": {
        if (p) return { ok: false, msg: "지금 키우는 친구가 있어요." };
        const egg = t.nest && t.nest.eggs.find((e) => e.id === a.eggId);
        if (!egg) return { ok: false, msg: "그 알은 이제 둥지에 없어요." };
        const sp = speciesOf(ctx.pack, egg.species);
        t.pet = { id: egg.id, species: egg.species, name: sp ? sp.name : "아기 공룡", stage: "egg", look: egg.look,
                  chosenAt: now, hatchDays: {}, hatchedAt: null, lastFedAt: null, love: 0, stageAt: { egg: now }, dead: false, diedAt: null };
        t.nest = null;                          // 나머지 알은 사라져요
        return { ok: true, msg: "알을 데려왔어요! 목표를 5일 채우면 부화해요.", events };
      }
      case "buy": {
        const f = foodOf(ctx.pack, a.food);
        if (!f) return { ok: false, msg: "없는 먹이예요." };
        const qty = Math.max(1, Math.min(9, a.qty | 0 || 1));
        const bal = coinInfo(t, ctx).balance;
        if (bal < f.price * qty) return { ok: false, msg: `코인이 ${f.price * qty - bal}개 모자라요. 공부 10분마다 1코인이 생겨요.` };
        t.spent += f.price * qty;
        t.inventory[f.id] = (t.inventory[f.id] || 0) + qty;     // 사기만 해서는 급식 시간이 바뀌지 않아요
        return { ok: true, msg: `${f.name} ${qty}개를 샀어요.`, events };
      }
      case "feed": {
        const f = foodOf(ctx.pack, a.food);
        if (!p) return { ok: false, msg: "먹이를 줄 친구가 없어요." };
        if (p.stage === "egg") return { ok: false, msg: "알은 아직 먹이를 먹지 않아요." };
        if (p.dead) return { ok: false, msg: "이미 떠난 친구예요." };
        if (!f) return { ok: false, msg: "없는 먹이예요." };
        if (!(t.inventory[f.id] > 0)) return { ok: false, msg: `${josa(f.name, "이가")} 없어요. 상점에서 사 주세요.` };
        t.inventory[f.id] -= 1;
        p.lastFedAt = now;
        p.love = (p.love || 0) + (f.love || 0);
        return { ok: true, msg: `${josa(p.name, "이가")} ${josa(f.name, "을를")} 맛있게 먹었어요!`, events: events.concat([{ type: "fed", food: f.id }]) };
      }
      case "rename": {
        if (!p) return { ok: false, msg: "" };
        const name = String(a.name || "").replace(/\s+/g, " ").trim().slice(0, cfg.nameMax || 10);
        if (!name) return { ok: false, msg: "이름을 적어 주세요." };
        p.name = name;
        return { ok: true, msg: `이름을 '${name}'${josa(name, "으로").slice(name.length)} 바꿨어요.`, events };
      }
      case "toFarm": {
        if (!p || p.dead || p.stage !== "adult") return { ok: false, msg: "성체가 된 친구만 농장에 갈 수 있어요." };
        t.farm.push({ id: p.id, species: p.species, name: p.name, movedAt: now, hatchedAt: p.hatchedAt, love: p.love || 0 });
        t.pet = null;
        return { ok: true, msg: `${josa(p.name, "이가")} 농장으로 갔어요. 새 알을 찾아볼까요?`, events };
      }
      case "release": {
        if (!p || !p.dead) return { ok: false, msg: "" };
        t.pet = null;
        return { ok: true, msg: "새 알을 찾으러 가요.", events };
      }
      default:
        return { ok: false, msg: "" };
    } })();
    // 실패한 급식도 직전 refresh에서 발생한 떠남/성장 이벤트는 전달해야 해요.
    return Object.assign({}, result, { events: result.events || events });
  }

  /* 모드 켜기/끄기: 꺼도 급식 시간은 그대로 흘러요(lastFedAt은 손대지 않음) */
  function setEnabled(t, on, now, pack) {
    if (on === t.enabled) return;
    t.enabled = on;
    if (on) {
      t.ranges.push({ from: now, to: null });
      if (!t.starterGiven) {                    // 시작 보급품(첫 급식용)
        for (const [k, n] of Object.entries(pack.config.starter || {})) t.inventory[k] = (t.inventory[k] || 0) + n;
        t.starterGiven = true;
      }
    } else {
      const r = t.ranges[t.ranges.length - 1];
      if (r && r.to == null) r.to = now;
    }
  }

  /* 팩 검사: 받은 파일이 망가지지 않았는지 */
  function validatePack(p) {
    if (!p || typeof p !== "object") return "팩 파일을 읽을 수 없어요.";
    if (!Array.isArray(p.species) || p.species.length < 20) return "펫 정보가 부족해요.";
    if (!Array.isArray(p.foods) || p.foods.length < 3) return "먹이 정보가 부족해요.";
    if (!p.config || !p.config.stageXp || !p.rarity) return "설정 값이 없어요.";
    for (const s of p.species) if (!s.id || !s.name || !s.rarity || !p.rarity[s.rarity]) return `펫 정보가 이상해요(${s.id || "?"}).`;
    return "";
  }

  root.TamaEngine = { josa, defaultState, migrate, refresh, derive, act, setEnabled, coinInfo, xpOf, hungerOf, probabilities, validatePack, speciesOf, foodOf, STAGES, STAGE_LABEL, HOUR };
  if (typeof module !== "undefined") module.exports = root.TamaEngine;
})(typeof window !== "undefined" ? window : globalThis);
