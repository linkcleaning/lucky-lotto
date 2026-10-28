// 앱(iOS/Android)에 넣을 웹 파일을 www/ 폴더로 모읍니다.
// 웹사이트(GitHub Pages)는 저장소 루트 파일을 그대로 쓰고, 앱은 이 www/ 폴더를 씁니다.
//   node scripts/build-www.mjs          → 일반 앱 빌드
//   SHOTS=1 node scripts/build-www.mjs  → 스토어 스크린샷 촬영용(예시 데이터 자동 입력)
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('www');
const COPY = ['index.html', 'privacy.html', 'favicon.ico', 'icons', 'sounds', 'data', 'vendor'];

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
for (const item of COPY) {
  await fs.cp(path.resolve(item), path.join(OUT, item), { recursive: true });
}
const htmlPath = path.join(OUT, 'index.html');
let html = await fs.readFile(htmlPath, 'utf8');
// 앱에서는 웹앱 매니페스트가 필요 없음 (서비스워커는 앱 모드에서 자동으로 꺼짐)
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');

if (process.env.SHOTS === '1') {
  const db = JSON.parse(await fs.readFile(path.resolve('data/draws.json'), 'utf8'));
  const round = Math.max(...Object.keys(db.draws).map(Number));
  const d = db.draws[round];
  const N = d.numbers, B = d.bonus;
  const miss = [...Array(45)].map((_, i) => i + 1).filter(n => !N.includes(n) && n !== B);
  const pick = (hits, from) => [...hits, ...miss.slice(from, from + 6 - hits.length)].sort((a, b) => a - b);
  const now = Date.now();
  const seed = {
    round,
    input: '19850312 19870729 3415 7',
    birth: { ymd: '19850312', cal: 'solar' },
    tickets: [
      { id: 's1', round, savedAt: now - 5 * 864e5, source: 'gen', games: [pick([N[0], N[2], N[3], N[5]], 3), pick([N[1]], 10), pick([N[1], N[4], N[5]], 20)] },
      { id: 's2', round, savedAt: now - 4 * 864e5, source: 'qr', types: ['자동', '자동'], qrKey: 'shot', games: [pick([N[0], N[3]], 26), pick([N[2], N[4], N[5]], 31)] },
      { id: 's3', round: round + 1, savedAt: now - 3600e3, source: 'gen', games: [pick([], 2), pick([], 14), pick([], 28)] }
    ],
    qr: { round, games: [pick([N[1], N[2], N[4]], 5), pick([N[0]], 17), pick([N[0], N[2], N[3], N[5]], 33)], types: ['자동', '자동', '자동'], key: 'shot-qr' }
  };
  await fs.copyFile(path.resolve('scripts/shot.js'), path.join(OUT, 'shot.js'));
  html = html.replace('<script>\n    (() => {', `<script>window.__LL_SEED=${JSON.stringify(seed)};</script>\n  <script src="shot.js"></script>\n  <script>\n    (() => {`);
  if (!html.includes('shot.js')) throw new Error('shot.js 를 넣을 위치를 못 찾음');
  console.log(`스크린샷용 예시 데이터: ${round}회 기준`);
}
await fs.writeFile(htmlPath, html);
console.log('www/ 준비 완료:', COPY.join(', '));
