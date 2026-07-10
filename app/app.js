/* Friends 영어공부 — SPA (vanilla JS, offline-first PWA) */
"use strict";

/* ── 상태 저장 ─────────────────────────────── */
const KEY = "fs_v1";
const state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.cards) return s;
  } catch (e) {}
  return { cards: {}, lastEp: null, daily: {}, seasonSel: 1 };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function today() { return new Date().toISOString().slice(0, 10); }

/* ── 데이터 로딩 ───────────────────────────── */
let INDEX = null;                 // data/index.json
const epCache = {}, vocabCache = {};
async function getIndex() {
  if (!INDEX) INDEX = await (await fetch("data/index.json")).json();
  return INDEX;
}
async function getEpisode(id) {
  if (!epCache[id]) epCache[id] = await (await fetch(`data/episodes/${id}.json`)).json();
  return epCache[id];
}
async function getVocab(id) {
  if (!vocabCache[id]) vocabCache[id] = await (await fetch(`data/vocab/${id}.json`)).json();
  return vocabCache[id];
}

/* ── SRS (SM-2 lite) ───────────────────────── */
const MIN10 = 10 * 60 * 1000, DAY = 24 * 60 * 60 * 1000;
function newCard(ep, i) {
  return { ep, i, due: Date.now(), iv: 0, ease: 2.5, reps: 0, lapses: 0, added: Date.now() };
}
function grade(c, g) { // g: 0 다시 / 1 어려움 / 2 알겠음 / 3 쉬움
  const now = Date.now();
  if (g === 0) {
    c.lapses++; c.reps = 0; c.iv = 0; c.due = now + MIN10;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else if (c.reps === 0) {
    c.reps = 1;
    c.iv = g === 1 ? 0.5 : g === 2 ? 1 : 3;
    c.due = now + c.iv * DAY;
    if (g === 3) c.ease = Math.min(3, c.ease + 0.15);
  } else {
    c.reps++;
    if (g === 1) { c.iv = Math.max(1, c.iv * 1.2); c.ease = Math.max(1.3, c.ease - 0.15); }
    else if (g === 2) { c.iv = Math.max(1, c.iv * c.ease); }
    else { c.iv = Math.max(1, c.iv * c.ease * 1.3); c.ease = Math.min(3, c.ease + 0.15); }
    c.iv = Math.round(c.iv * 10) / 10;
    c.due = now + c.iv * DAY;
  }
  const d = today();
  state.daily[d] = (state.daily[d] || 0) + 1;
  save();
}
function dueCards() {
  const now = Date.now();
  return Object.entries(state.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due);
}
function ivLabel(c, g) {
  if (g === 0) return "10분";
  let iv;
  if (c.reps === 0) iv = g === 1 ? 0.5 : g === 2 ? 1 : 3;
  else iv = Math.max(1, c.iv * (g === 1 ? 1.2 : g === 2 ? c.ease : c.ease * 1.3));
  return iv < 1 ? "12시간" : Math.round(iv) + "일";
}

/* ── 유틸 ─────────────────────────────────── */
const $ = (s) => document.querySelector(s);
function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
const SPK = { rachel: "--c-rachel", monica: "--c-monica", ross: "--c-ross",
  chandler: "--c-chandler", joey: "--c-joey", phoebe: "--c-phoebe" };
function spkColor(name) {
  const k = Object.keys(SPK).find((n) => name.toLowerCase().startsWith(n));
  return `var(${k ? SPK[k] : "--c-etc"})`;
}
const STOP = new Set(["someone", "somebody", "something", "sth", "sb", "one's",
  "ones", "a", "an", "the", "to", "be", "it", "that", "this", "of", "in", "on",
  "with", "and", "or", "you", "your", "name", "adjective", "number", "i", "is",
  "was", "so", "not", "no", "do", "did"]);
// 정답 판정용: 표현의 핵심 단어 (구동사의 up/out/off 같은 짧은 불변화사 포함)
const STOP_STRICT = new Set(["someone", "somebody", "something", "sth", "sb",
  "one's", "ones", "a", "an", "the", "to", "be", "that", "it", "this", "you",
  "your", "name", "adjective", "number", "i", "is", "was", "and", "or"]);
function exprWords(expr, stop) {
  return expr.replace(/\(([^)]*)\)/g, " $1 ").replace(/\[[^\]]*\]/g, " ")
    .split(/[\/~,]/).join(" ").split(/[^A-Za-z']+/)
    .map((w) => w.toLowerCase().replace(/'s$/, ""))
    .filter((w) => w.length >= 2 && !stop.has(w));
}
function exprKeywords(expr) {
  return exprWords(expr, STOP).filter((w) => w.length >= 3)
    .sort((a, b) => b.length - a.length);
}
function stemLite(w) {
  return w.length > 4 ? w.replace(/(e|ed|ing|s)$/, "") : w;
}
/* 주관식 채점: 표현의 핵심 단어가 모두 입력에 들어 있으면 정답.
   "A / B"처럼 대안이 병기된 표현은 그중 하나만 맞히면 정답. */
function judgeAnswer(typed, expr) {
  const t = typed.toLowerCase().replace(/[^a-z' ]/g, " ");
  const typedWords = t.split(/\s+/).filter(Boolean).map(stemLite);
  let best = { ok: false, hits: 0, total: 1 };
  for (const alt of expr.split("/")) {
    const targets = [...new Set(exprWords(alt, STOP_STRICT).map(stemLite))];
    if (targets.length === 0) continue;
    const hits = targets.filter((k) =>
      typedWords.some((w) => w === k || (k.length >= 4 && w.startsWith(k)) || (w.length >= 4 && k.startsWith(w))));
    const r = { ok: hits.length === targets.length, hits: hits.length, total: targets.length };
    if (r.ok || r.hits / r.total > best.hits / best.total) best = r;
    if (best.ok) break;
  }
  return best;
}
/* 대사에서 표현 단어를 <mark> 또는 빈칸 span으로 감싼다 */
function markDialogue(dialogue, expr, mode) {
  const words = exprKeywords(expr);
  let html = esc(dialogue);
  let found = false;
  for (const w of words) {
    const stem = w.length > 4 ? w.replace(/(e|ed|ing|s)$/, "") : w;
    if (stem.length < 3) continue;
    const re = new RegExp(`\\b(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z']*)`, "gi");
    if (re.test(html)) {
      found = true;
      html = html.replace(re, mode === "cloze"
        ? '<span class="blank">$1</span>' : "<mark>$1</mark>");
    }
  }
  return { html, found };
}
let toastTimer;
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ── 라우터 ───────────────────────────────── */
const view = $("#view"), titleEl = $("#title"), backBtn = $("#backBtn");
window.addEventListener("hashchange", render);
$("#settingsBtn").addEventListener("click", () => (location.hash = "#/settings"));
backBtn.addEventListener("click", () => history.back());
document.querySelectorAll("#tabbar .tab").forEach((b) =>
  b.addEventListener("click", () => (location.hash = b.dataset.route)));

function setChrome(title, back, route) {
  titleEl.textContent = title;
  backBtn.hidden = !back;
  document.querySelectorAll("#tabbar .tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route));
}
function updateBadge() {
  const n = dueCards().length, b = $("#reviewBadge");
  b.hidden = n === 0;
  b.textContent = n > 99 ? "99+" : n;
}

async function render() {
  const h = location.hash || "#/home";
  updateBadge();
  try {
    if (h.startsWith("#/episode/")) await renderEpisode(h.slice(10));
    else if (h === "#/review") await renderReview();
    else if (h === "#/settings") renderSettings();
    else await renderHome();
  } catch (e) {
    view.innerHTML = `<div class="review-empty"><div class="big">불러오기 실패</div>
      <p>${esc(e.message)}</p><p>네트워크 연결을 확인한 뒤 다시 열어주세요.</p></div>`;
  }
  view.scrollTop = 0; window.scrollTo(0, 0);
}

/* ── 홈 ───────────────────────────────────── */
async function renderHome() {
  setChrome("F·R·I·E·N·D·S", false, "#/home");
  const idx = await getIndex();
  const due = dueCards().length;
  const done = state.daily[today()] || 0;
  const total = due + done;
  const pct = total === 0 ? 1 : done / total;
  const R = 80, CIRC = 2 * Math.PI * R;

  const seasons = [...new Set(idx.map((e) => e.season))];
  const sel = seasons.includes(state.seasonSel) ? state.seasonSel : seasons[0];
  const eps = idx.filter((e) => e.season === sel);

  const last = state.lastEp && idx.find((e) => e.id === state.lastEp);

  view.innerHTML = `
  <div class="peephole-wrap">
    <div class="peephole" role="button" tabindex="0" aria-label="복습 시작">
      <svg width="172" height="172" viewBox="0 0 172 172" aria-hidden="true">
        <circle cx="86" cy="86" r="${R}" fill="none" stroke="var(--ring-track)" stroke-width="9"/>
        <circle cx="86" cy="86" r="${R}" fill="none" stroke="var(--frame)" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - pct)}"/>
      </svg>
      <div class="inner">
        <span class="num">${due}</span>
        <span class="lbl">복습 대기</span>
      </div>
    </div>
    <div class="peephole-cap">${
      due > 0 ? `링을 눌러 복습 시작 · 오늘 <b>${done}</b>장 완료`
      : done > 0 ? `오늘 복습 끝! <b>${done}</b>장 완료`
      : `에피소드에서 표현을 카드에 담아보세요`}</div>
  </div>

  ${last ? `
  <div class="sec">
    <button class="continue" data-ep="${last.id}">
      <div>
        <div class="big">${esc(last.code)}. ${esc(last.title)}</div>
        <div class="sub">이어서 학습하기</div>
      </div>
      <span class="arrow">›</span>
    </button>
  </div>` : ""}

  <div class="sec">
    <div class="sec-h">SEASONS <small>${idx.filter((e) => e.hasVocab).length}/${idx.length} 에피소드 표현 준비됨</small></div>
    <div class="seasons">
      ${seasons.map((s) => {
        const n = idx.filter((e) => e.season === s && e.hasVocab).length;
        return `<button class="season-chip ${s === sel ? "active" : ""}" data-season="${s}">
          시즌 ${s}<span class="mini">${n > 0 ? n + "화 준비" : "대본만"}</span></button>`;
      }).join("")}
    </div>
    <div class="eplist">
      ${eps.map((e) => {
        const st = epStatus(e);
        return `<button class="ep" data-ep="${e.id}">
          <span class="no">${esc(String(e.code).split("-")[0])}</span>
          <span class="t"><span class="en">${esc(e.title)}</span>
          <span class="meta">대사 ${e.dialogueCount}줄${e.hasVocab ? ` · 표현 ${e.exprCount}개` : ""}</span></span>
          <span class="st ${st.cls}">${st.label}</span>
        </button>`;
      }).join("")}
    </div>
  </div>`;

  $(".peephole").addEventListener("click", () => (location.hash = "#/review"));
  $(".peephole").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") location.hash = "#/review";
  });
  view.querySelectorAll("[data-season]").forEach((b) =>
    b.addEventListener("click", () => { state.seasonSel = +b.dataset.season; save(); renderHome(); }));
  view.querySelectorAll("[data-ep]").forEach((b) =>
    b.addEventListener("click", () => (location.hash = "#/episode/" + b.dataset.ep)));
}
function epStatus(e) {
  if (!e.hasVocab) return { cls: "nodata", label: "대본만" };
  const n = Object.keys(state.cards).filter((k) => k.startsWith(e.id + "#")).length;
  if (n === 0) return { cls: "none", label: "시작 전" };
  if (n >= e.exprCount) return { cls: "done", label: "담기 완료" };
  return { cls: "doing", label: `${n}/${e.exprCount}` };
}

/* ── 에피소드 ─────────────────────────────── */
let epTab = "vocab";
async function renderEpisode(id) {
  const idx = await getIndex();
  const meta = idx.find((e) => e.id === id);
  if (!meta) throw new Error("에피소드를 찾을 수 없습니다: " + id);
  state.lastEp = id; save();
  setChrome(meta.code, true, "");
  if (!meta.hasVocab) epTab = "script";

  view.innerHTML = `
  <div class="ep-head">
    <div class="code">EPISODE ${esc(meta.code)}</div>
    <div class="en">${esc(meta.title)}</div>
  </div>
  <div class="segtabs">
    <button data-t="vocab" ${meta.hasVocab ? "" : "disabled"} class="${epTab === "vocab" ? "active" : ""}">표현 ${meta.hasVocab ? meta.exprCount : ""}</button>
    <button data-t="script" class="${epTab === "script" ? "active" : ""}">대본</button>
  </div>
  <div id="epBody"><div class="loading">불러오는 중…</div></div>`;

  view.querySelectorAll("[data-t]").forEach((b) =>
    b.addEventListener("click", () => {
      epTab = b.dataset.t;
      view.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("active", x === b));
      renderEpBody(meta);
    }));
  await renderEpBody(meta);
}

async function renderEpBody(meta) {
  const body = $("#epBody");
  if (epTab === "vocab" && meta.hasVocab) {
    const vocab = await getVocab(meta.id);
    const allIn = vocab.expressions.every((_, i) => state.cards[meta.id + "#" + i]);
    body.innerHTML = `
      <button class="addall" ${allIn ? "disabled" : ""}>${allIn ? "전체 표현이 카드에 담겨 있어요" : "표현 25개 모두 카드에 담기"}</button>
      <div class="xlist">
      ${vocab.expressions.map((x, i) => {
        const inDeck = !!state.cards[meta.id + "#" + i];
        return `<div class="x" data-i="${i}">
          <button class="x-head">
            <span class="expr"><span class="en">${esc(x.expression)}</span>
            <span class="ko">${esc(x.meaning)}</span></span>
            <span class="x-add ${inDeck ? "in" : ""}" role="button" aria-label="카드에 담기">${inDeck ? "✓" : "+"}</span>
          </button>
          <div class="x-body">
            <div class="dlg">${markDialogue(x.dialogue, x.expression, "mark").html}</div>
            <h4>뉘앙스</h4><p>${esc(x.nuance)}</p>
            <h4>예문</h4><p class="ex">${esc(x.example)}</p>
          </div>
        </div>`;
      }).join("")}</div>`;

    body.querySelector(".addall").addEventListener("click", () => {
      let n = 0;
      vocab.expressions.forEach((_, i) => {
        const k = meta.id + "#" + i;
        if (!state.cards[k]) { state.cards[k] = newCard(meta.id, i); n++; }
      });
      save(); toast(`${n}개 표현을 카드에 담았어요`);
      renderEpBody(meta); updateBadge();
    });
    body.querySelectorAll(".x").forEach((el) => {
      const i = +el.dataset.i, k = meta.id + "#" + i;
      el.querySelector(".x-head").addEventListener("click", (ev) => {
        if (ev.target.closest(".x-add")) {
          if (state.cards[k]) { delete state.cards[k]; toast("카드에서 뺐어요"); }
          else { state.cards[k] = newCard(meta.id, i); toast("카드에 담았어요"); }
          save(); updateBadge();
          const btn = el.querySelector(".x-add");
          btn.classList.toggle("in", !!state.cards[k]);
          btn.textContent = state.cards[k] ? "✓" : "+";
        } else {
          el.classList.toggle("open");
        }
      });
    });
  } else {
    const ep = await getEpisode(meta.id);
    body.innerHTML = `<div class="script">
      ${ep.lines.map((l) => {
        if (l.t === "scene") return `<div class="scene">[${esc(l.text)}]</div>`;
        if (l.t === "dialogue") return `<div class="line"><span class="spk" style="color:${spkColor(l.speaker)}">${esc(l.speaker)}</span>${esc(l.text)}</div>`;
        return `<div class="dir">${esc(l.text)}</div>`;
      }).join("")}</div>`;
  }
}

/* ── 복습 ─────────────────────────────────── */
let queue = [], qTotal = 0;
async function renderReview() {
  setChrome("복습", false, "#/review");
  queue = dueCards();
  qTotal = (state.daily[today()] || 0) + queue.length;
  if (queue.length === 0) {
    const done = state.daily[today()] || 0;
    view.innerHTML = `<div class="donebox">
      <div class="ring">◎</div>
      <div class="big">${done > 0 ? "오늘 복습 완료!" : "복습할 카드가 없어요"}</div>
      <p>${done > 0 ? `${done}장을 복습했어요. 내일 문구멍에서 만나요.`
        : "에피소드 화면에서 표현을 카드에 담으면\n여기에 복습 카드가 쌓입니다."}</p>
    </div>`;
    return;
  }
  await showCard();
}
async function showCard() {
  updateBadge();
  if (queue.length === 0) return renderReview();
  const [key, card] = queue[0];
  const vocab = await getVocab(card.ep);
  const x = vocab.expressions[card.i];
  if (!x) { delete state.cards[key]; save(); queue.shift(); return showCard(); }
  const idx = await getIndex();
  const meta = idx.find((e) => e.id === card.ep);
  const cloze = markDialogue(x.dialogue, x.expression, "cloze");
  const doneToday = (state.daily[today()] || 0);

  view.innerHTML = `
  <div class="rv-progress">${doneToday + 1} / ${qTotal}</div>
  <div class="card">
    <div class="q-ko">${esc(x.meaning)}</div>
    ${cloze.found ? `
    <button class="hintbtn">힌트 보기 (대사)</button>
    <div class="q-dlg" hidden>${cloze.html}</div>` : ""}
    <form class="answer-form" autocomplete="off">
      <input class="answer-input" type="text" inputmode="latin" autocapitalize="off"
        autocorrect="off" spellcheck="false" placeholder="영어 표현을 입력해보세요"
        aria-label="영어 표현 입력">
      <button class="checkbtn" type="submit">확인</button>
    </form>
    <div class="verdict" hidden></div>
    <div class="a" hidden>
      <div class="en">${esc(x.expression)}</div>
      <div class="q-dlg">${markDialogue(x.dialogue, x.expression, "mark").html}</div>
      <h4>뉘앙스</h4><p>${esc(x.nuance)}</p>
      <h4>예문</h4><p>${esc(x.example)}</p>
      <div class="src">${esc(meta ? meta.code + ". " + meta.title : card.ep)} · ${esc(x.speaker)}의 대사</div>
    </div>
  </div>
  <button class="showbtn">입력 없이 정답 보기</button>
  <div class="grades" hidden>
    <button class="g-again">다시<small>${ivLabel(card, 0)}</small></button>
    <button class="g-hard">어려움<small>${ivLabel(card, 1)}</small></button>
    <button class="g-good">알겠음<small>${ivLabel(card, 2)}</small></button>
    <button class="g-easy">쉬움<small>${ivLabel(card, 3)}</small></button>
  </div>`;

  function reveal() {
    $(".card .a").hidden = false;
    $(".showbtn").hidden = true;
    $(".answer-form").hidden = true;
    const hint = $(".hintbtn");
    if (hint) hint.hidden = true;
    const frontDlg = $(".card > .q-dlg");
    if (frontDlg) frontDlg.hidden = true; // 해설 쪽 대사만 남긴다
    $(".grades").hidden = false;
  }
  const hintBtn = $(".hintbtn");
  if (hintBtn) hintBtn.addEventListener("click", () => {
    $(".card .q-dlg").hidden = false;
    hintBtn.hidden = true;
  });
  $(".answer-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const typed = $(".answer-input").value.trim();
    if (!typed) return;
    const r = judgeAnswer(typed, x.expression);
    const v = $(".verdict");
    v.hidden = false;
    v.className = "verdict " + (r.ok ? "v-ok" : "v-no");
    v.innerHTML = r.ok
      ? `⭕ 정답! <span class="typed">${esc(typed)}</span>`
      : `❌ 아쉬워요 <span class="typed">${esc(typed)}</span>`;
    reveal();
  });
  $(".showbtn").addEventListener("click", reveal);
  [["g-again", 0], ["g-hard", 1], ["g-good", 2], ["g-easy", 3]].forEach(([cls, g]) =>
    $("." + cls).addEventListener("click", () => {
      grade(card, g);
      queue.shift();
      if (g === 0) queue.push([key, card]); // 이번 세션 안에서 다시
      showCard();
    }));
}

/* ── 설정 ─────────────────────────────────── */
function renderSettings() {
  setChrome("설정", true, "");
  const cards = Object.values(state.cards);
  const learned = cards.filter((c) => c.reps >= 1).length;
  const streak = calcStreak();
  view.innerHTML = `
  <div class="stat-grid">
    <div class="stat"><div class="n">${cards.length}</div><div class="l">전체 카드</div></div>
    <div class="stat"><div class="n">${learned}</div><div class="l">학습된 카드</div></div>
    <div class="stat"><div class="n">${streak}</div><div class="l">연속 학습일</div></div>
  </div>
  <div class="setlist">
    <button id="exportBtn">학습 데이터 내보내기 (클립보드 복사)</button>
    <button id="importBtn">학습 데이터 가져오기 (붙여넣기)</button>
    <button id="resetBtn" class="danger">모든 학습 기록 초기화</button>
  </div>`;
  $("#exportBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state));
      toast("클립보드에 복사했어요");
    } catch (e) { toast("복사 실패 — 브라우저 권한을 확인하세요"); }
  });
  $("#importBtn").addEventListener("click", () => {
    const t = prompt("내보내기로 복사한 데이터를 붙여넣으세요:");
    if (!t) return;
    try {
      const s = JSON.parse(t);
      if (!s.cards) throw new Error();
      Object.assign(state, s); save();
      toast("가져오기 완료"); render();
    } catch (e) { toast("올바른 데이터가 아니에요"); }
  });
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("카드와 학습 기록이 모두 삭제됩니다. 계속할까요?")) {
      localStorage.removeItem(KEY);
      location.reload();
    }
  });
}
function calcStreak() {
  let n = 0;
  const d = new Date();
  if (!state.daily[today()]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했으면 어제부터
  while (state.daily[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ── 시즌1 오프라인 프리페치 + SW ──────────── */
async function prefetch() {
  try {
    const idx = await getIndex();
    for (const e of idx.filter((x) => x.season === 1)) {
      await fetch(`data/episodes/${e.id}.json`).catch(() => {});
      if (e.hasVocab) await fetch(`data/vocab/${e.id}.json`).catch(() => {});
    }
  } catch (e) {}
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(() => {
    if (navigator.onLine) setTimeout(prefetch, 3000);
  });
}

render();
