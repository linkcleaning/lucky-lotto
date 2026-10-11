// 동행복권 로또 6/45 당첨번호를 받아 data/draws.json 에 저장합니다.
// GitHub Actions(.github/workflows/update-draws.yml)가 매주 토요일 밤에 실행합니다.
// 직접 실행: node scripts/update-draws.mjs   (처음 실행 시 최근 BACKFILL 회차를 채움)

import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('data/draws.json');
const BACKFILL = Number(process.env.BACKFILL || 30);       // 처음에 채울 회차 수
const WEEK = 7 * 864e5;
const DRAW1 = Date.UTC(2002, 11, 7, 11, 35);               // 1회 추첨: 2002-12-07 20:35 KST
const API = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do';

const latestExpected = Math.floor((Date.now() - DRAW1) / WEEK) + 1;

async function load() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return { updated: null, source: 'dhlottery.co.kr', draws: {} };
  }
}

function ymd(v) {
  const s = String(v || '').replace(/[^0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

function normalize(item) {
  const numbers = [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo]
    .map(Number).sort((a, b) => a - b);
  const d = { round: Number(item.ltEpsd), date: ymd(item.ltRflYmd), numbers, bonus: Number(item.bnsWnNo) };
  const ok = Number.isInteger(d.round) && d.round > 0 &&
    numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 45) && new Set(numbers).size === 6 &&
    Number.isInteger(d.bonus) && d.bonus >= 1 && d.bonus <= 45 && !numbers.includes(d.bonus);
  return ok ? d : null;
}

async function fetchAround(round) {
  const url = `${API}?srchDir=center&srchLtEpsd=${round}`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0 (compatible; lucky-lotto-pwa/1.0)',
      referer: 'https://www.dhlottery.co.kr/lt645/result'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('JSON 아님 (차단되었거나 점검 중일 수 있음)'); }
  const list = json?.data?.list;
  if (!Array.isArray(list)) throw new Error('응답에 data.list 가 없음');
  return list.map(normalize).filter(Boolean);
}

const db = await load();
db.draws ||= {};
// 최근 BACKFILL 회차 중 빠진 회차만 받아옴 (처음엔 채우고, 이후엔 새 회차만)
const start = Math.max(1, latestExpected - BACKFILL + 1);

let added = 0;
for (let r = start; r <= latestExpected; r++) {
  if (db.draws[r]) continue;
  try {
    const items = await fetchAround(r);
    for (const d of items) {
      if (!db.draws[d.round]) { db.draws[d.round] = d; added++; }
    }
    if (!db.draws[r]) console.log(`${r}회: 아직 발표 전이거나 응답에 없음`);
    else console.log(`${r}회: ${db.draws[r].numbers.join(', ')} + ${db.draws[r].bonus}`);
  } catch (e) {
    console.log(`${r}회 가져오기 실패: ${e.message}`);
  }
  await new Promise(ok => setTimeout(ok, 400));
}

if (added) {
  // 최신 회차가 앞에 오도록 정렬해서 저장
  const sorted = {};
  Object.keys(db.draws).map(Number).sort((a, b) => b - a).forEach(k => { sorted[k] = db.draws[k]; });
  db.draws = sorted;
  db.updated = new Date().toISOString();
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2) + '\n');
  console.log(`새로 추가한 회차: ${added}개`);
} else {
  console.log('추가할 회차 없음');
}
