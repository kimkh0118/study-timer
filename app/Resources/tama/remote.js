/* 다마고치+ 테스트 리모컨
 * 날짜(시계) · 코인 · 공부 기록 · 부화 · 배고픔 · 먹이를 마음대로 바꿔서 시험해 보는 작은 창이에요.
 * 열기: 다마고치 창 맨 아래 "테스트 리모컨" 또는 ⌃⇧T.
 * 리모컨으로 넣은 공부 기록은 test 표시가 붙어 있어서 "테스트 기록 지우기"로 한 번에 지울 수 있어요. */
(function () {
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const T = () => state.tama;
  // 저장된 테스트 시계 되살리기(앱을 껐다 켜도 같은 '테스트 날짜'로)
  window.__tamaClock = (state.tama && state.tama.testClock) || 0;

  function setClock(ms) {
    window.__tamaClock = ms;
    T().testClock = ms;
    writeNow();
    tamaTick();
  }
  const fmt = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // 타이머로 공부한 것처럼 기록 넣기: 공부한 만큼 테스트 시계도 흘러가요(그래야 부화 뒤 경험치에도 들어가요)
  function addStudy(hours) {
    const sec = Math.round(hours * 3600);
    window.__tamaClock = (window.__tamaClock || 0) + sec * 1000 + 60e3;
    T().testClock = window.__tamaClock;
    const end = tamaNow() - 30e3;
    state.sessions.push({ id: "test-" + Math.random().toString(36).slice(2, 9), start: end - sec * 1000, end, sec,
      subject: state.settings.subject, test: true });
    writeNow(); renderAll(); tamaTick();
  }

  const actions = {
    // 시계
    h1: () => setClock((window.__tamaClock || 0) + HOUR),
    h12: () => setClock((window.__tamaClock || 0) + 12 * HOUR),
    d1: () => setClock((window.__tamaClock || 0) + DAY),
    d3: () => setClock((window.__tamaClock || 0) + 3 * DAY),
    now: () => setClock(0),
    // 공부
    s1: () => addStudy(1),
    s4: () => addStudy(4),
    s10: () => addStudy(10),
    // 하루 목표 채운 날로 하루 넘기기: 다음 날로 가서 4시간 공부
    day: () => { setClock((window.__tamaClock || 0) + DAY); addStudy(Math.max(4.05, state.settings.goalMin / 60 + 0.05)); },
    // 코인 · 먹이
    c100: () => { T().spent = (T().spent || 0) - 100; writeNow(); tamaTick(); },
    c1000: () => { T().spent = (T().spent || 0) - 1000; writeNow(); tamaTick(); },
    food: () => { const inv = T().inventory; for (const f of tamaPack.foods) inv[f.id] = (inv[f.id] || 0) + 5; writeNow(); tamaTick(); },
    // 알 · 펫
    hatch: () => { const p = T().pet; if (!p || p.stage !== "egg") return toast("알이 있을 때만 돼요");
      const n = tamaNow(); for (let i = 0; i < tamaPack.config.hatchDays; i++) p.hatchDays["test-" + i] = n; writeNow(); tamaTick(); },
    fed24: () => { const p = T().pet; if (!p || !p.lastFedAt) return toast("깨어난 펫이 있을 때만 돼요");
      p.lastFedAt -= DAY; writeNow(); tamaTick(); },
    fedNow: () => { const p = T().pet; if (!p || !p.lastFedAt || p.dead) return toast("살아 있는 펫이 있을 때만 돼요");
      p.lastFedAt = tamaNow(); writeNow(); tamaTick(); },
    // 목표 · 모드
    goal2: () => { if (T().enabled) TamaEngine.setEnabled(T(), false, tamaNow(), tamaPack);
      if (T().winOpen) tamaOpenPet(false);
      state.settings.goalMin = 120; writeNow(); renderAll(); tamaTick(); toast("모드를 끄고 목표를 2시간으로 바꿨어요. 다시 켜면 4시간 안내가 떠요"); },
    // 정리
    clearTest: () => { const before = state.sessions.length; state.sessions = state.sessions.filter((s) => !s.test);
      // 테스트로 번 코인은 같이 없애요: 코인 장부를 새로 잡고(지운 만큼 남겨 두지 않게), 미래 날짜 보너스도 지워요
      T().coinRaw = null;
      const today = dayKey(Date.now());
      for (const k of Object.keys(T().bonusDays)) if (k > today) delete T().bonusDays[k];
      writeNow(); renderAll(); tamaTick(); toast(`테스트 공부 기록 ${before - state.sessions.length}개를 지웠어요`); },
    reset: () => { const keep = { installed: T().installed, packVersion: T().packVersion };
      state.tama = Object.assign(TamaEngine.defaultState(), keep, { fx: [] }); window.__tamaClock = 0;
      state.sessions = state.sessions.filter((s) => !s.test);
      writeNow(); renderAll(); tamaOpenPet(false); tamaTick(); toast("다마고치를 처음 상태로 되돌렸어요(받은 그림은 그대로)"); },
  };

  const BTNS = [
    ["날짜", [["h1", "+1시간"], ["h12", "+12시간"], ["d1", "+1일"], ["d3", "+3일"], ["now", "지금으로"]]],
    ["공부", [["s1", "+1시간"], ["s4", "+4시간"], ["s10", "+10시간"], ["day", "다음 날 목표 달성"]]],
    ["재화", [["c100", "+100코인"], ["c1000", "+1000코인"], ["food", "먹이 각 +5"]]],
    ["펫", [["hatch", "바로 부화"], ["fed24", "급식 −24시간"], ["fedNow", "배부르게"]]],
    ["기타", [["goal2", "목표 2시간 · 모드 끄기"], ["clearTest", "테스트 기록 지우기"], ["reset", "다마고치 초기화"]]],
  ];

  const box = document.createElement("div");
  box.className = "tama-remote glass";
  box.hidden = true;
  box.innerHTML = `<div class="tr-head"><b>테스트 리모컨</b><button class="tr-x" data-tr="close" aria-label="닫기">×</button></div>
    <div class="tr-stat" id="trStat"></div>
    ${BTNS.map(([g, list]) => `<div class="tr-row"><span>${g}</span><div>${list.map(([k, l]) => `<button data-tr="${k}">${l}</button>`).join("")}</div></div>`).join("")}
    <p class="tr-note">리모컨으로 넣은 공부는 달력 · 그래프에도 보여요. 다 쓰면 "테스트 기록 지우기"와 "지금으로"를 눌러 주세요.</p>`;
  document.body.appendChild(box);

  function stat() {
    if (box.hidden) return;
    const t = T(), el = $("#trStat");
    if (!tamaReady()) { el.textContent = "먼저 다마고치 모드를 받아 주세요."; return; }
    const d = TamaEngine.derive(t, tamaCtx()), p = t.pet;
    const off = window.__tamaClock || 0;
    const lines = [
      `테스트 시각 ${fmt(tamaNow())}${off ? ` (실제보다 ${Math.round(off / HOUR)}시간 뒤)` : " (지금)"}`,
      `모드 ${t.enabled ? "켜짐" : "꺼짐"} · 목표 ${Math.round(state.settings.goalMin / 6) / 10}시간 · 코인 ${d.coins.balance}`,
      !p ? "키우는 펫 없음" : p.stage === "egg" ? `알 · 부화 ${d.egg.count}/${d.egg.need}일 · 오늘 ${fmtDur(d.egg.todaySec)}`
        : `${p.name} · ${({ baby: "아기", teen: "아성체", adult: "성체" })[p.stage]} · XP ${d.xp ? d.xp.xp : 0}${p.dead ? " · 떠남" : ` · 급식 ${Math.max(0, Math.floor((tamaNow() - p.lastFedAt) / HOUR))}시간 전`}`,
    ];
    el.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join("");
  }

  function toggle(on) { box.hidden = on === undefined ? !box.hidden : !on; stat(); }
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tr]"); if (!b) return;
    if (b.dataset.tr === "close") return toggle(false);
    if (!tamaReady() && b.dataset.tr !== "reset") return toast("먼저 다마고치 모드를 받아 주세요");
    actions[b.dataset.tr] && actions[b.dataset.tr]();
    if (!$("#sheetWrap").hidden && sheetRender === renderTama) renderTama();
    stat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t" || e.code === "KeyT")) { e.preventDefault(); toggle(); }
  });
  // 다마고치 창 맨 아래에 여는 버튼
  document.addEventListener("click", (e) => { if (e.target.closest("[data-tama-remote]")) toggle(true); });
  const _render = renderTama;
  renderTama = function () {
    _render();
    const body = $("#sheetBody");
    if (body && !body.querySelector("[data-tama-remote]"))
      body.insertAdjacentHTML("beforeend", `<div class="tr-open"><button class="soft" data-tama-remote>테스트 리모컨 (⌃⇧T)</button></div>`);
  };
  setInterval(stat, 2000);
  window.__tamaRemote = { toggle, actions };
})();
