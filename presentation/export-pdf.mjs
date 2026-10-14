// 슬라이드 덱을 16:9 PDF 로 내보낸다.
//   node presentation/export-pdf.mjs [입력.html] [출력.pdf]
// Chrome 의 --print-to-pdf CLI 는 @page margin 을 무시하고 기본 0.4in 을 적용해
// 내용을 축소시킨다. 그래서 CDP Page.printToPDF 로 용지와 여백을 직접 지정한다.
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const input = resolve(process.argv[2] ?? 'presentation/part1-발표자료-이지은.html');
const output = resolve(process.argv[3] ?? input.replace(/\.html$/, '.pdf'));
const PORT = 9333;

if (!existsSync(input)) { console.error('입력 파일 없음:', input); process.exit(1); }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--user-data-dir=/tmp/deck-pdf-profile',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('Chrome DevTools 엔드포인트에 연결 실패');
}

const ws = new WebSocket(await endpoint());
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve: res, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : res(m.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);

await call('Page.enable');
await call('Page.navigate', { url: pathToFileURL(input).href });

// 웹폰트(Pretendard)와 레이아웃이 안정될 때까지 기다린다.
for (let i = 0; i < 40; i++) {
  const { result } = await call('Runtime.evaluate', {
    expression: `(document.readyState === 'complete') && document.fonts.status === 'loaded'
                 && document.fonts.check('800 40px Pretendard')`,
    returnByValue: true,
  });
  if (result.value) break;
  await sleep(250);
}
await sleep(600);

const { result: count } = await call('Runtime.evaluate', {
  expression: `document.querySelectorAll('.slide').length`, returnByValue: true,
});

const { data } = await call('Page.printToPDF', {
  paperWidth: 13.333,          // 1280px @ 96dpi
  paperHeight: 7.5,            //  720px @ 96dpi
  marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
  printBackground: true,       // 다크 divider·채색 카드가 빠지지 않게
  preferCSSPageSize: false,    // 위 용지 값을 강제
  scale: 1,
  transferMode: 'ReturnAsBase64',
});

writeFileSync(output, Buffer.from(data, 'base64'));
console.log(`슬라이드 ${count.value}장 → ${output}`);

ws.close();
chrome.kill();
