/* 다마고치+ 그림: 펫(공룡) · 알 · 둥지.
 * 팩에 진짜 그림(PNG)이 있으면 그걸 쓰고, 없으면 여기서 그린 임시 SVG를 써요. */
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function shade(hex, k) {         // k<0 어둡게, k>0 밝게
    const m = hex.replace("#", ""); const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  /* ── 임시 공룡 SVG (진짜 그림이 오기 전까지) ── */
  function dinoSVG(sp, stage, opts = {}) {
    const a = sp.art || {}, c = a.c || "#9bd37f", b = a.b || "#eef8e3", ac = a.a || "#5c9a46";
    const ol = shade(c, -0.45), f = new Set(a.feat || []);
    const fs = stage === "baby" ? 0.45 : stage === "teen" ? 0.75 : 1;        // 특징 크기
    const sc = stage === "baby" ? 0.62 : stage === "teen" ? 0.8 : 1;          // 몸 크기
    const hs = stage === "baby" ? 1.3 : stage === "teen" ? 1.12 : 1;          // 머리 비율(아기는 머리가 커요)
    const sw = 2.4 / sc;
    const S = (o) => `stroke="${ol}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${o || ""}`;
    const sil = opts.silhouette;
    const pose = a.pose || "biped";
    let back = "", body = "", front = "";
    let hx, hy, hr;                                   // 머리 중심/반지름(얼굴용)

    if (pose === "biped") {
      hx = 72; hy = 50; hr = 15 * hs;
      // 꼬리
      back += `<path d="M40 84 Q22 90 12 ${f.has("longtail") ? 96 : 90} Q24 82 42 74 Z" fill="${c}" ${S()}/>`;
      if (f.has("sail")) back += `<path d="M38 66 Q50 ${66 - 34 * fs} 66 ${60 - 10 * fs} Q60 70 38 70 Z" fill="${ac}" ${S()}/>`;
      if (f.has("feathers")) back += `<path d="M36 70 q-6 -8 2 -10 q2 -8 8 -4" fill="${ac}" ${S()}/>`;
      // 다리
      body += `<rect x="46" y="88" width="10" height="14" rx="5" fill="${c}" ${S()}/><rect x="62" y="88" width="10" height="14" rx="5" fill="${c}" ${S()}/>`;
      body += `<ellipse cx="58" cy="78" rx="21" ry="19" fill="${c}" ${S()}/>`;
      body += `<ellipse cx="62" cy="82" rx="12" ry="12" fill="${b}"/>`;
      if (f.has("arms") || f.has("claw") || f.has("thumb") || f.has("bigclaws")) {
        const L = f.has("bigclaws") ? 12 * fs + 4 : 5;
        body += `<path d="M74 72 q6 2 ${4 + L * 0.4} ${L * 0.6}" fill="none" ${S()}/>`;
      }
      if (f.has("slim")) hy -= 4;
    } else if (pose === "quad") {
      hx = f.has("longneck") ? 90 : 88; hy = f.has("longneck") ? 30 + (1 - fs) * 14 : 62; hr = 12 * hs;
      back += `<path d="M30 80 Q14 ${f.has("longtail") ? 96 : 88} 6 ${f.has("longtail") ? 100 : 92} Q20 78 34 72 Z" fill="${c}" ${S()}/>`;
      if (f.has("club")) back += `<circle cx="9" cy="92" r="${5 * fs + 2}" fill="${ac}" ${S()}/>`;
      if (f.has("tailspikes")) back += `<path d="M14 86 l-4 -8 l6 4 M20 82 l-2 -9 l5 6" fill="${ac}" ${S()}/>`;
      body += [34, 48, 66, 80].map((x) => `<rect x="${x - 5}" y="86" width="10" height="16" rx="5" fill="${c}" ${S()}/>`).join("");
      body += `<ellipse cx="57" cy="78" rx="30" ry="17" fill="${c}" ${S()}/>`;
      body += `<ellipse cx="60" cy="84" rx="18" ry="8" fill="${b}"/>`;
      if (f.has("longneck")) body += `<path d="M76 74 Q88 60 ${hx - 4} ${hy + 6} L${hx + 6} ${hy + 8} Q96 64 84 80 Z" fill="${c}" ${S()}/>`;
      if (f.has("plates") || f.has("spikes")) {
        const n = 5, out = [];
        for (let i = 0; i < n; i++) { const x = 36 + i * 9, h = (f.has("plates") ? 12 : 9) * fs + 3; out.push(`<path d="M${x - 4} ${64 - Math.sin(i / (n - 1) * Math.PI) * 4} L${x} ${60 - h - Math.sin(i / (n - 1) * Math.PI) * 4} L${x + 4} ${64 - Math.sin(i / (n - 1) * Math.PI) * 4} Z" fill="${ac}" ${S()}/>`); }
        back += out.join("");
      }
      if (f.has("armor")) body += [40, 52, 64, 74].map((x, i) => `<circle cx="${x}" cy="${70 + (i % 2) * 3}" r="${2.6 * fs + 1}" fill="${ac}"/>`).join("");
    } else if (pose === "fly") {
      hx = 64; hy = 48; hr = 13 * hs;
      const w = 30 * fs + 10;
      back += `<path d="M56 68 Q${56 - w} ${54 - w * 0.5} ${56 - w * 1.1} 76 Q${56 - w * 0.5} 70 56 76 Z" fill="${f.has("rainbow") ? "#ffd27e" : ac}" ${S()}/>`;
      back += `<path d="M62 68 Q${62 + w} ${54 - w * 0.5} ${62 + w * 1.1} 76 Q${62 + w * 0.5} 70 62 76 Z" fill="${f.has("rainbow") ? "#9fe3ff" : ac}" ${S()}/>`;
      body += `<rect x="50" y="88" width="8" height="12" rx="4" fill="${c}" ${S()}/><rect x="62" y="88" width="8" height="12" rx="4" fill="${c}" ${S()}/>`;
      body += `<ellipse cx="60" cy="76" rx="15" ry="16" fill="${c}" ${S()}/><ellipse cx="60" cy="80" rx="9" ry="10" fill="${b}"/>`;
      if (f.has("backcrest")) back += `<path d="M${hx - 6} ${hy - 6} L${hx - 26 * fs - 6} ${hy - 14 * fs} L${hx - 2} ${hy + 2} Z" fill="${ac}" ${S()}/>`;
    } else {                                            // swim
      hx = f.has("longneck") ? 92 : 86; hy = f.has("longneck") ? 40 + (1 - fs) * 14 : 70; hr = 12 * hs;
      back += `<path d="M28 78 Q12 70 6 ${f.has("fintail") ? 64 : 76} Q12 82 6 ${f.has("fintail") ? 94 : 84} Q18 86 30 84 Z" fill="${c}" ${S()}/>`;
      body += `<ellipse cx="58" cy="78" rx="32" ry="15" fill="${c}" ${S()}/><ellipse cx="62" cy="84" rx="20" ry="6" fill="${b}"/>`;
      body += `<path d="M48 88 q-6 10 -14 10 q6 -4 8 -12 Z M70 88 q4 10 12 10 q-6 -4 -6 -12 Z" fill="${ac}" ${S()}/>`;
      if (f.has("longneck")) body += `<path d="M78 72 Q90 60 ${hx - 4} ${hy + 6} L${hx + 6} ${hy + 8} Q96 66 86 80 Z" fill="${c}" ${S()}/>`;
      front += `<path d="M20 104 q10 -6 20 0 t20 0 t20 0 t20 0" fill="none" stroke="#9fd6ff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
    }

    // 머리 뒤 장식
    if (f.has("frill")) back += `<circle cx="${hx - 6}" cy="${hy - 2}" r="${hr + 8 * fs + 2}" fill="${ac}" ${S()}/>`;
    if (f.has("neckfrill")) back += `<path d="M${hx - 12} ${hy + 8} q-10 -${10 * fs} -2 -${20 * fs} q6 10 10 14 Z" fill="${ac}" ${S()}/>`;
    if (f.has("tubecrest")) back += `<path d="M${hx - 2} ${hy - hr + 4} Q${hx - 20 * fs - 6} ${hy - hr - 12 * fs} ${hx - 28 * fs - 8} ${hy - hr + 2}" fill="none" stroke="${ol}" stroke-width="${7 * fs + 3}" stroke-linecap="round"/><path d="M${hx - 2} ${hy - hr + 4} Q${hx - 20 * fs - 6} ${hy - hr - 12 * fs} ${hx - 28 * fs - 8} ${hy - hr + 2}" fill="none" stroke="${ac}" stroke-width="${7 * fs}" stroke-linecap="round"/>`;
    // 머리
    let head = `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="${c}" ${S()}/>`;
    if (f.has("dome")) head += `<path d="M${hx - hr * 0.8} ${hy - hr * 0.4} Q${hx} ${hy - hr - 8 * fs - 3} ${hx + hr * 0.8} ${hy - hr * 0.4}" fill="${ac}" ${S()}/>`;
    const snx = hx + hr * 0.75, sny = hy + hr * 0.25;
    if (f.has("beak") || f.has("duckbill")) head += `<path d="M${snx - 3} ${sny - 5} Q${snx + 10} ${sny - 2} ${snx + (f.has("duckbill") ? 9 : 7)} ${sny + 4} Q${snx} ${sny + 6} ${snx - 3} ${sny + 3} Z" fill="${f.has("duckbill") ? ac : shade(ac, 0.2)}" ${S()}/>`;
    else head += `<ellipse cx="${snx}" cy="${sny}" rx="${hr * 0.5}" ry="${hr * 0.38}" fill="${c}" ${S()}/><circle cx="${snx + hr * 0.25}" cy="${sny - 2}" r="1.3" fill="${ol}"/>`;
    // 뿔·볏
    if (f.has("horns3")) head += `<path d="M${snx + 2} ${sny - hr * 0.35} l${3 * fs + 1} -${8 * fs + 2} l1 ${8 * fs + 3} Z" fill="#fff6e0" ${S()}/>` +
      [-6, 6].map((d) => `<path d="M${hx + d - 2} ${hy - hr * 0.85} l${1} -${12 * fs + 2} l${4} ${12 * fs + 3} Z" fill="#fff6e0" ${S()}/>`).join("");
    if (f.has("horns2")) head += [-5, 5].map((d) => `<path d="M${hx + d - 3} ${hy - hr * 0.8} l${d > 0 ? 6 : -6} -${8 * fs + 2} l${d > 0 ? -1 : 1} ${8 * fs + 4} Z" fill="${ac}" ${S()}/>`).join("");
    if (f.has("crest")) head += `<path d="M${hx - 4} ${hy - hr + 1} q2 -${10 * fs + 3} 8 -${6 * fs + 2} q4 2 2 ${8 * fs + 2} Z" fill="${ac}" ${S()}/>`;
    if (f.has("doublecrest")) head += [-4, 4].map((d) => `<path d="M${hx + d - 4} ${hy - hr + 2} q0 -${12 * fs + 3} 8 -${12 * fs + 3} q0 8 -4 ${12 * fs + 3} Z" fill="${ac}" ${S()}/>`).join("");
    if (f.has("feathers") && pose !== "biped") head += `<path d="M${hx - 3} ${hy - hr} q-2 -6 3 -8 q-1 5 2 8" fill="${ac}" ${S()}/>`;
    // 얼굴
    const er = (stage === "baby" ? 3.6 : 3) * (hs > 1 ? 1.05 : 1);
    head += `<ellipse cx="${hx + hr * 0.15}" cy="${hy - hr * 0.12}" rx="${er}" ry="${er * 1.15}" fill="#3a2a2a"/><circle cx="${hx + hr * 0.15 + er * 0.35}" cy="${hy - hr * 0.12 - er * 0.4}" r="${er * 0.4}" fill="#fff"/>`;
    head += `<ellipse cx="${hx + hr * 0.1}" cy="${hy + hr * 0.42}" rx="${hr * 0.22}" ry="${hr * 0.13}" fill="#ff9fb0" opacity=".7"/>`;
    head += `<path d="M${snx - hr * 0.1} ${sny + hr * 0.2} q3 3 6 0" fill="none" stroke="${ol}" stroke-width="${sw * 0.7}" stroke-linecap="round"/>`;

    let g = back + body + head + front;
    const shadow = `<ellipse cx="60" cy="105" rx="${34 * sc}" ry="${4 * sc}" fill="#000" opacity=".08"/>`;
    if (sil) g = `<g filter="url(#silf)">${g}</g>`;
    const defs = sil ? `<defs><filter id="silf"><feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.36  0 0 0 0 0.42  0 0 0 1 0"/></filter></defs>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112" class="dino-svg">${defs}${shadow}<g transform="translate(60 104) scale(${sc}) translate(-60 -104)">${g}</g></svg>`;
  }

  /* ── 알 ── */
  function eggSVG(look, opts = {}) {
    const L = Object.assign({ color: "#fff4dc", spot: "#ffd27e", pattern: "dots", size: 1, tilt: 0 }, look || {});
    const ol = shade(L.color, -0.45), sp = L.spot === L.color ? shade(L.color, -0.18) : L.spot;
    const id = "e" + Math.random().toString(36).slice(2, 8);
    const egg = "M50 8 C72 8 86 42 86 66 C86 88 70 100 50 100 C30 100 14 88 14 66 C14 42 28 8 50 8 Z";
    const pats = {
      dots: [[34, 40, 5], [60, 30, 4], [66, 58, 6], [40, 70, 5], [56, 84, 4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${sp}"/>`).join(""),
      stripes: [36, 56, 76].map((y) => `<path d="M10 ${y} Q50 ${y - 8} 90 ${y}" stroke="${sp}" stroke-width="7" fill="none"/>`).join(""),
      zigzag: `<path d="M10 56 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8" stroke="${sp}" stroke-width="6" fill="none" stroke-linejoin="round"/>`,
      stars: [[36, 42], [62, 34], [58, 68], [36, 76]].map(([x, y]) => `<path d="M${x} ${y - 6} l2 4 4.5 .6 -3.3 3 .9 4.6 -4.1 -2.3 -4.1 2.3 .9 -4.6 -3.3 -3 4.5 -.6 Z" fill="${sp}"/>`).join(""),
      hearts: [[38, 44], [62, 58], [42, 76]].map(([x, y]) => `<path d="M${x} ${y + 5} l-6 -6 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 Z" fill="${sp}"/>`).join(""),
      waves: [44, 66].map((y) => `<path d="M10 ${y} q10 -8 20 0 t20 0 t20 0 t20 0" stroke="${sp}" stroke-width="5" fill="none"/>`).join(""),
      speckle: Array.from({ length: 16 }, (_, i) => `<circle cx="${22 + ((i * 37) % 56)}" cy="${22 + ((i * 53) % 70)}" r="${1.6 + (i % 3)}" fill="${sp}"/>`).join(""),
      plain: "",
      band: `<rect x="10" y="52" width="80" height="12" fill="${sp}"/>`,
      leaves: [[36, 46, -30], [62, 60, 25], [44, 78, -10]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="4" transform="rotate(${r} ${x} ${y})" fill="${sp}"/>`).join(""),
    };
    const crack = opts.crack ? `<path d="M30 52 l8 6 l6 -8 l8 8 l6 -6 l8 6" stroke="${ol}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>` : "";
    // 팩에 그려 둔 알 그림이 있으면 그걸 써요(모양·크기·기울기는 같은 규칙)
    const img = L.art != null && root.TamaArt.assetFor && root.TamaArt.assetFor(`ui/egg_${L.art}.png`);
    if (img) {
      const crk = opts.crack ? `<path d="M30 54 l8 6 l6 -8 l8 8 l6 -6 l8 6" stroke="#5b4630" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108" class="egg-svg" style="--tilt:${L.tilt || 0}deg">
      <ellipse cx="50" cy="103" rx="30" ry="4" fill="#000" opacity=".08"/>
      <g transform="translate(50 100) scale(${L.size || 1}) rotate(${L.tilt || 0}) translate(-50 -100)">
        <image href="${esc(img)}" x="2" y="4" width="96" height="98" preserveAspectRatio="xMidYMax meet"${opts.dim ? ` style="filter:grayscale(.55) brightness(.62)"` : ""}/>${crk}
      </g></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 108" class="egg-svg" style="--tilt:${L.tilt || 0}deg">
      <defs><clipPath id="${id}"><path d="${egg}"/></clipPath><radialGradient id="${id}g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="50" cy="103" rx="30" ry="4" fill="#000" opacity=".08"/>
      <g transform="translate(50 100) scale(${L.size || 1}) rotate(${L.tilt || 0}) translate(-50 -100)">
        <path d="${egg}" fill="${L.color}"/>
        <g clip-path="url(#${id})">${pats[L.pattern] || ""}</g>
        <path d="${egg}" fill="url(#${id}g)"/>
        <path d="${egg}" fill="none" stroke="${ol}" stroke-width="2.6"/>${crack}${opts.dim ? `<path d="${egg}" fill="#23232c" fill-opacity=".5"/>` : ""}
      </g></svg>`;
  }

  /* ── 둥지 ── */
  function nestSVG() {
    const tw = [];
    for (let i = 0; i < 26; i++) {
      const y = 46 + (i % 5) * 7, x1 = 10 + ((i * 29) % 40), x2 = x1 + 120 + ((i * 17) % 50);
      tw.push(`<path d="M${x1} ${y + 6} Q${(x1 + x2) / 2} ${y - 10 + (i % 3) * 6} ${x2} ${y + 4}" stroke="${["#b9824f", "#a06a3d", "#cf9c64", "#8d5a31"][i % 4]}" stroke-width="${3 + (i % 3)}" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 90" class="nest-svg" preserveAspectRatio="xMidYMax meet">
      <ellipse cx="110" cy="80" rx="100" ry="8" fill="#000" opacity=".08"/>
      <path d="M8 46 Q110 104 212 46 Q206 82 110 86 Q14 82 8 46 Z" fill="#c58d57" stroke="#7d4f2a" stroke-width="2.5"/>
      ${tw.join("")}
      <path d="M14 46 Q110 64 206 46" stroke="#e6b77c" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  }

  /* 펫 그림: 팩에 PNG가 있으면 <img>, 없으면 임시 SVG */
  function petArt(pack, sp, stage, opts = {}) {
    if (!sp) return "";
    const src = root.TamaArt.imageFor && root.TamaArt.imageFor(sp, stage);
    if (src) return `<img class="pet-img st-${stage}${opts.silhouette ? " sil" : ""}" src="${esc(src)}" alt="${esc(sp.name)}" draggable="false">`;
    return dinoSVG(sp, stage, opts);
  }

  root.TamaArt = { dinoSVG, eggSVG, nestSVG, petArt, shade, imageFor: null, assetFor: null };
})(typeof window !== "undefined" ? window : globalThis);
