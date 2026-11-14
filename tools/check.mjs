#!/usr/bin/env node
// 리포 관리자용 검사기. 학습자에게는 필요 없다.
// 검사: 커리큘럼 형식·선수 관계(R2), 국내·글로벌 칸(R10), 졸업 산출물 칸(R12),
//       인용과 출처 원장 대조(R11), 미리 만든 시각 자료 없음(R5), 설정 JSON 유효성.
// `node tools/check.mjs --self-test`는 인용 검사가 틀린 예를 실제로 잡는지 확인한다.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

const LEVELS = ["Explain", "Apply", "Evaluate", "Develop"];
const FIELDS = ["선수", "핵심 질문", "목표", "만들어 볼 것", "국내 근거", "글로벌 비교"];
const X_FIELDS = ["산출물", "검토 기준"];
const GRADES = ["원문", "대체원문", "목차"];
const LEDGER = "curriculum/sources.md";
// spec.md 경계 표의 이웃. 각각 1개 이상 모듈의 「경계·연결」에 나와야 한다.
const NEIGHBORS = ["go-finance", "go-accounting", "go-tax", "go-startup-agile", "go-strategy", "go-control", "go-compliance-and-legal", "감정평가"];

// ---------- 커리큘럼 ----------
function parseCurriculum(text) {
  const modules = new Map();
  const problems = [];
  const used = new Set();
  for (const block of text.split(/^### /m).slice(1)) {
    const head = block.split("\n")[0];
    const m = head.match(/^([FMRPX]\d+) · (.+)$/);
    if (!m) { problems.push(`모듈 제목 형식 오류: ${head}`); continue; }
    const id = m[1];
    if (modules.has(id)) problems.push(`${id}: 중복 id`);
    const fields = {};
    for (const line of block.split("\n").slice(1)) {
      const f = line.match(/^- ([^:]+): (.+)$/);
      if (f) fields[f[1]] = f[2].trim();
    }
    const need = id.startsWith("X") ? [...FIELDS, ...X_FIELDS] : FIELDS;
    for (const name of need) if (!fields[name]) problems.push(`${id}: 「${name}」 없음`);
    if (fields["목표"] && !LEVELS.some((l) => fields["목표"].startsWith(`${l} — `))) problems.push(`${id}: 목표 수준 형식 오류`);
    if (id.startsWith("X") && fields["목표"] && !fields["목표"].startsWith("Develop — ")) problems.push(`${id}: 졸업 프로젝트 목표는 Develop`);
    if (fields["경계·연결"] && !NEIGHBORS.some((n) => fields["경계·연결"].includes(n))) problems.push(`${id}: 경계·연결에 이웃 이름 없음`);
    for (const n of NEIGHBORS) if (fields["경계·연결"]?.includes(n)) used.add(n);
    const prereq = !fields["선수"] || fields["선수"] === "없음" ? [] : fields["선수"].split(",").map((s) => s.trim());
    modules.set(id, prereq);
  }
  for (const n of NEIGHBORS) if (!used.has(n)) problems.push(`경계 이웃 「${n}」이 어느 모듈의 경계·연결에도 없음`);
  for (const [id, prereq] of modules) for (const p of prereq) if (!modules.has(p)) problems.push(`${id}: 없는 선수 ${p}`);
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2 || !modules.has(id)) return;
    if (state.get(id) === 1) { problems.push(`선수 순환: ${[...path, id].join(" → ")}`); return; }
    state.set(id, 1);
    for (const p of modules.get(id)) visit(p, [...path, id]);
    state.set(id, 2);
  };
  for (const id of modules.keys()) visit(id, []);
  return { modules, problems };
}

// ---------- 출처 원장 ----------
const norm = (s) => s.replace(/\s+/g, "");

function parseLedger(text) {
  const rows = new Map();
  const problems = [];
  for (const line of text.split("\n")) {
    if (!/^\|\s*L\d{2}\s*\|/.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (c.length < 8) { problems.push(`원장 칸 수 오류: ${c[0]}`); continue; }
    const [id, source, alias, cites, url, date, grade, recheck] = c;
    if (rows.has(id)) problems.push(`원장 ${id}: 중복`);
    if (!source) problems.push(`원장 ${id}: 출처 없음`);
    const urls = url.match(/https:\/\/[^\s)>]+/g) || [];
    if (!urls.length) problems.push(`원장 ${id}: https URL 없음`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`원장 ${id}: 조회일 형식 오류`);
    if (!GRADES.includes(grade)) problems.push(`원장 ${id}: 확인 등급 「${grade}」 — 원문·대체원문·목차만 허용(미확인 행은 출고 불가)`);
    if (!["잦음", "-"].includes(recheck)) problems.push(`원장 ${id}: 재확인 칸은 잦음 또는 -`);
    const citeSet = cites === "-" ? [] : cites.split("·").map(norm).filter(Boolean);
    const names = [source, ...(alias === "-" ? [] : alias.split("·"))].map((x) => x.trim()).filter(Boolean);
    rows.set(id, { grade, cites: citeSet, names });
  }
  return { rows, problems };
}

// ---------- 인용 검사 ----------
const MAIN = [
  /제\s?\d+(?:-\d+)?조(?:의\s?\d+)?/g,
  /(?:K-IFRS|기업회계기준서)\s?제\s?\d{4}호/g,
  /\bIFRS\s?\d+\b/g,
  /\bIAS\s?\d+\b/g,
  /\bASC\s?\d{3}\b(?!-)/g,
  /\bIVS\s?\d{3}\b/g,
  /Rev\.\s?Rul\.\s?\d+-\d+/g,
  /§\s?\d+(?:\.\d+[A-Z]*(?:-\d+)?)?/g,
  /\bSection\s\d+(?:\.\d+)*/g,
  /\b409A\b/g,
  /별표\s?\d+/g,
  /\bBVS-[IVX]+\b/g,
];
const SUB = [
  /제\s?\d{1,3}[항호](?!\d)/g,
  /문단\s?[A-Z]?\d+/g,
  /\bpara\.?\s?\d+/gi,
  /\bASC\s?\d{3}(?:-\d{2}){1,2}\b/g,
];
const BARE_ARTICLE = /(?<![제\d.,-])\d+조(?:의\s?\d+)?(?!\s?원)/g; // 「3조 원」 같은 금액은 제외
const BARE_STD = /(?<!(?:K-IFRS|기업회계기준서)\s?)제\s?\d{4}호/g;

function tokens(line, list, withPos = false) {
  const out = [];
  for (const re of list) for (const m of line.matchAll(re)) out.push(withPos ? { t: norm(m[0]), at: m.index } : norm(m[0]));
  return out;
}

// 토큰 바로 앞에서 가장 가까이 끝나는 약칭(같으면 가장 긴 것)을 가진 행들
function nearestNameRows(line, at, rows) {
  let best = null;
  for (const [id, r] of rows) for (const n of r.names) {
    // 토큰 시작(at) 전에 끝나는 마지막 출현
    const i = at - n.length < 0 ? -1 : line.lastIndexOf(n, at - n.length);
    if (i < 0) continue;
    const end = i + n.length;
    // 이름과 토큰 사이가 짧고(30자 이하) 다른 인용으로 끊기지 않아야 그 토큰의 법령명으로 본다
    const gap = line.slice(end, at);
    if (gap.length > 30 || /[,;\[\]()、]/.test(gap)) continue;
    if (!best || end > best.end || (end === best.end && n.length > best.len)) best = { end, len: n.length, ids: new Set([id]) };
    else if (end === best.end && n.length === best.len) best.ids.add(id);
  }
  return best;
}

function checkLine(line, rows) {
  const problems = [];
  const main = tokens(line, MAIN);
  const sub = tokens(line, SUB);
  for (const m of line.matchAll(BARE_STD)) problems.push(`기준서 이름 없는 번호 「${m[0]}」`);
  for (const m of line.matchAll(BARE_ARTICLE)) problems.push(`「제」 없는 조문 표기 「${m[0]}」`);
  if (!main.length && !sub.length) return problems;
  const ids = [...line.matchAll(/\[(L\d{2})\]/g)].map((m) => m[1]);
  if (!ids.length) { problems.push(`원장 id 없는 인용 ${[...main, ...sub].join(", ")}`); return problems; }
  const known = ids.filter((id) => rows.has(id));
  for (const id of ids) if (!rows.has(id)) problems.push(`원장에 없는 id ${id}`);
  const cites = known.flatMap((id) => rows.get(id).cites);
  for (const t of main) if (!cites.includes(t)) problems.push(`「${t}」가 ${ids.join(",")} 행의 인용 칸에 없음`);
  // 법령명-조문 짝은 조 단위 토큰(제N조·별표)에만 본다. 기준 번호(IVS·IFRS 등)는 토큰 자체가 기준 이름을 담는다
  for (const { t, at } of tokens(line, [MAIN[0], /별표\s?\d+/g], true)) {
    const near = nearestNameRows(line, at, rows);
    if (!near) continue;
    const ok = [...near.ids].some((id) => known.includes(id) && rows.get(id).cites.includes(t));
    if (!ok) problems.push(`「${t}」 앞의 법령·기준 이름이 가리키는 행(${[...near.ids].join(",")})이 이 줄의 id·인용과 맞지 않음`);
  }
  for (const t of sub) if (!cites.some((c) => c.includes(t))) problems.push(`세부 인용 「${t}」가 ${ids.join(",")} 행의 인용 칸에 없음`);
  if (sub.length && known.some((id) => rows.get(id).grade === "목차")) problems.push(`목차 등급 행에 세부 인용 ${sub.join(", ")}`);
  return problems;
}

function checkCitations(files, rows) {
  const problems = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      for (const p of checkLine(line, rows)) problems.push(`${f}:${i + 1} ${p}`);
    });
  }
  return problems;
}

function selfTest() {
  const { rows } = parseLedger([
    "| L01 | 가상세법 시행령 | 같은 법 시행령 | 제54조·제5-13조 | https://example.org | 2026-11-14 | 원문 | 잦음 |",
    "| L02 | 가상기준 | IVS | IVS 102 | https://example.org | 2026-11-14 | 목차 | - |",
    "| L03 | 가상법인세법 시행령 | - | 제89조 제2항·제89조·제52조 | https://example.org | 2026-11-14 | 원문 | - |",
    "| L04 | 가상회사법 | - | § 262·Section 3.4·별표 1 | https://example.org | 2026-11-14 | 원문 | - |",
  ].join("\n"));
  const cases = [
    ["통과: 원장과 맞는 인용", "시행령 제54조 [L01]", true],
    ["통과: 세부 인용이 원장에 있음", "시행령 제89조 제2항 [L03]", true],
    ["통과: 인용 없는 줄", "가치는 목적에 따라 다르다", true],
    ["실패: 원장 id 없는 조문", "시행령 제54조에 따르면", false],
    ["실패: 다른 행 id를 단 조문", "시행령 제54조 [L02]", false],
    ["실패: 접두 일치(제54조의2)", "시행령 제54조의2 [L01]", false],
    ["실패: 목차 등급 행에 문단 인용", "IVS 102 문단 20 [L02]", false],
    ["실패: 원장에 없는 세부 인용", "시행령 제54조 제3항 [L01]", false],
    ["실패: 기준서 이름 없는 4자리 번호", "제1113호에서 정한다 [L01]", false],
    ["실패: 원장에 없는 id", "제54조 [L09]", false],
    ["통과: 약칭과 행이 맞음", "가상세법 시행령 제54조 [L01]", true],
    ["실패: 법령명 불일치", "가상세법 시행령 제52조 [L01][L03]", false],
    ["통과: 같은 법 약칭", "같은 법 시행령 제5-13조 [L01]", true],
    ["실패: 「제」 없는 조문", "시행령 54조에 따르면 [L01]", false],
    ["통과: 띄어쓰기 없는 §", "가상회사법 §262 [L04]", true],
    ["실패: 원장에 없는 Section", "Section 3.5 [L04]", false],
    ["실패: 원장 id 없는 별표", "별표 1 참조", false],
  ];
  let bad = 0;
  for (const [name, line, ok] of cases) {
    const got = checkLine(line, rows).length === 0;
    if (got !== ok) { bad++; console.error(`SELF-TEST FAIL ${name}: ${line}`); }
  }
  const { problems } = parseLedger("| L09 | 미확인 | - | 제1조 | https://example.org | 2026-11-14 | 대기 | - |");
  if (!problems.some((p) => p.includes("확인 등급"))) { bad++; console.error("SELF-TEST FAIL 미확인 등급 행을 잡지 못함"); }
  if (bad) process.exit(1);
  console.log(`OK 자기시험 ${cases.length + 1}건`);
}

// ---------- 시각 자료(R5) ----------
function findVisualAssets(files) {
  const allowedJs = /^tools\/.*\.m?js$/;
  return files.filter((f) => /\.(html?|css|svg|png|jpe?g|gif|webp|avif)$/i.test(f) || (/\.m?js$/i.test(f) && !allowedJs.test(f)));
}

function findTemplateMarkup(text) {
  for (const m of text.matchAll(/(```|~~~)[\s\S]*?\1/g)) if (/<(!doctype|html|svg|style|canvas|script)\b/i.test(m[0])) return true;
  return false;
}

function main() {
  const errors = [];
  const { modules, problems } = parseCurriculum(read("curriculum/map.md"));
  errors.push(...problems);
  if (modules.size === 0) errors.push("모듈을 찾지 못함");

  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean).filter((f) => existsSync(join(root, f)));
  for (const f of findVisualAssets(files)) errors.push(`미리 만든 시각 자료 금지: ${f}`);
  for (const f of files.filter((x) => x.endsWith(".md"))) if (findTemplateMarkup(read(f))) errors.push(`복사용 마크업 금지: ${f}`);

  const ledger = parseLedger(read(LEDGER));
  errors.push(...ledger.problems);
  if (ledger.rows.size === 0) errors.push("원장 행이 없음");
  const learnerPath = files.filter((f) => /\.(md|json)$/.test(f) && !f.startsWith("docs/build/") && f !== LEDGER && !f.startsWith("tools/"));
  errors.push(...checkCitations(learnerPath, ledger.rows));

  for (const p of [".claude/settings.json", "learner-template/state.json"]) {
    try { JSON.parse(read(p)); } catch (e) { errors.push(`${p}: JSON 오류 ${e.constructor.name}`); }
  }
  if (!existsSync(join(root, "learner-template/log.md"))) errors.push("learner-template/log.md 없음");
  for (const s of readdirSync(join(root, ".claude/skills"))) {
    if (statSync(join(root, ".claude/skills", s)).isDirectory() && !existsSync(join(root, ".claude/skills", s, "SKILL.md"))) errors.push(`스킬 ${s}: SKILL.md 없음`);
  }
  if (!read(".gitignore").split("\n").includes("learner/")) errors.push(".gitignore에 learner/ 없음");

  if (errors.length) { console.error(errors.map((e) => `FAIL ${e}`).join("\n")); process.exit(1); }
  console.log(`OK 모듈 ${modules.size}개, 원장 ${ledger.rows.size}행, 인용 검사 파일 ${learnerPath.length}개, 파일 ${files.length}개 검사`);
}

if (process.argv.includes("--self-test")) selfTest(); else main();
