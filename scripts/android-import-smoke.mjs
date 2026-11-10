import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const adb =
  process.env.ADB ||
  "C:/Users/fedim/AppData/Local/Android/Sdk/platform-tools/adb.exe";
const serial = process.env.ANDROID_SERIAL || "emulator-5564";
if (!serial.startsWith("emulator-"))
  throw new Error("Run this test only on a disposable emulator.");
const command = (args, options = {}) =>
  execFileSync(adb, ["-s", serial, ...args], { timeout: 60000, ...options });
const app = "app.mlibrary.reader";
const created = [];
let socket,
  sequence = 0,
  originalLanguage;
const requests = new Map();
async function connect() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const pid = command(["shell", "pidof", app]).toString().trim();
      command([
        "forward",
        "tcp:9223",
        `localabstract:webview_devtools_remote_${pid}`,
      ]);
      const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
      const target = targets.find((t) => t.url.startsWith("https://localhost"));
      if (target) {
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.addEventListener("open", resolve, { once: true });
          socket.addEventListener("error", reject, { once: true });
        });
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data),
            request = requests.get(message.id);
          if (!request) return;
          requests.delete(message.id);
          clearTimeout(request.timer);
          if (message.error) request.reject(new Error(message.error.message));
          else request.resolve(message.result);
        });
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("App WebView did not start");
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error(`Timed out: ${method} ${params.expression || ""}`));
    }, 45000);
    requests.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  return result.result.value;
}
async function until(expression, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(`(async () => Boolean(await (${expression})))()`)) {
        console.log(`PASS: ${label}`);
        return;
      }
    } catch (error) {
      if (
        !/Access is denied|Cannot find context|Execution context was destroyed/.test(
          error.message,
        )
      )
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    label + ": " + (await evaluate("document.body.innerText.slice(0,1600)")),
  );
}
function media(name, bytes) {
  command([
    "shell",
    "content",
    "insert",
    "--uri",
    "content://media/external/downloads",
    "--bind",
    `_display_name:s:${name}`,
    "--bind",
    "mime_type:s:application/pdf",
  ]);
  const rows = command([
    "shell",
    "content",
    "query",
    "--uri",
    "content://media/external/downloads",
    "--projection",
    "_id:_display_name",
  ]).toString();
  const row = rows
    .split("\n")
    .find((line) => line.includes(`_display_name=${name}`));
  const id = row?.match(/_id=(\d+)/)?.[1];
  assert.ok(id, rows);
  const uri = `content://media/external/downloads/${id}`;
  created.push(uri);
  command(["shell", "content", "write", "--uri", uri], { input: bytes });
  return uri;
}
try {
  command(["shell", "am", "start", "-W", "-n", `${app}/.MainActivity`]);
  await connect();
  await until(
    "!!window.Capacitor?.Plugins?.BookImport",
    "native import plugin registered",
  );
  originalLanguage = await evaluate(
    "JSON.parse(localStorage.getItem('mlibrary:v1') || '{}').language || 'en'",
  );
  await evaluate(
    "localStorage.setItem('mlibrary:v1',JSON.stringify({...JSON.parse(localStorage.getItem('mlibrary:v1') || '{\"version\":1}'),language:'en'}))",
  );
  socket.close();
  const stamp = Date.now();
  const bytes = Buffer.concat([
    await readFile("tests/fixtures/reader.pdf"),
    Buffer.from(`\n% MLibrary native import test ${stamp}\n`),
  ]);
  const id = "local:" + createHash("sha256").update(bytes).digest("hex");
  const uri = media(`MLibrary-native-${stamp}.pdf`, bytes);
  const resolvers = command([
    "shell",
    "cmd",
    "package",
    "query-activities",
    "--components",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    uri,
    "-t",
    "application/pdf",
  ]).toString();
  assert.ok(resolvers.includes(app), "MLibrary must appear in Open with");
  console.log("PASS: Android Open with registration");
  command(["shell", "am", "force-stop", app]);
  command([
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    uri,
    "-t",
    "application/pdf",
    "-f",
    "1",
    "-n",
    `${app}/.MainActivity`,
  ]);
  await connect();
  const entry = `JSON.parse(localStorage.getItem('mlibrary:v1') || '{}').shelf?.[${JSON.stringify(id)}]`;
  await until(
    `${entry}?.offline && document.querySelector('.pdf-page canvas')?.width > 0`,
    "cold-start Open with imports and opens the PDF",
  );
  const stored = await evaluate(
    `new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('keyval').objectStore('keyval').get(${JSON.stringify("book:" + id)});q.onsuccess=()=>{resolve(q.result?.data?.byteLength);db.close()};q.onerror=()=>reject(q.error)}})`,
  );
  assert.equal(stored, bytes.length);
  console.log("PASS: complete original bytes saved offline");
  const count = await evaluate(
    "Object.keys(JSON.parse(localStorage.getItem('mlibrary:v1')).shelf).length",
  );
  await evaluate(
    "(async()=>{window.__importReady=0;await Capacitor.Plugins.BookImport.addListener('ready',()=>window.__importReady++);return true})()",
  );
  command([
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.SEND",
    "--eu",
    "android.intent.extra.STREAM",
    uri,
    "-t",
    "application/pdf",
    "-f",
    "1",
    "-n",
    `${app}/.MainActivity`,
  ]);
  await until(
    "window.__importReady > 0",
    "native receiver signals shared file readiness",
  );
  await until(
    "!document.querySelector('.incoming-book') && document.querySelector('.pdf-page canvas')?.width > 0",
    "warm Share keeps the reader open",
  );
  await until(
    "Capacitor.Plugins.BookImport.pending().then(result => result.items.length === 0)",
    "native queue acknowledged",
  );
  assert.equal(
    await evaluate(
      "Object.keys(JSON.parse(localStorage.getItem('mlibrary:v1')).shelf).length",
    ),
    count,
  );
  console.log("PASS: repeated share does not duplicate the shelf");
  const invalid = media(
    `MLibrary-invalid-${stamp}.pdf`,
    Buffer.from("<html>Just a moment...</html>"),
  );
  command([
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    invalid,
    "-t",
    "application/pdf",
    "-f",
    "1",
    "-n",
    `${app}/.MainActivity`,
  ]);
  await until(
    "document.querySelector('.incoming-book [role=alert]')",
    "HTML masquerading as PDF is rejected",
  );
  assert.equal(
    await evaluate(
      "Object.keys(JSON.parse(localStorage.getItem('mlibrary:v1')).shelf).length",
    ),
    count,
  );
  await evaluate(
    "[...document.querySelectorAll('.incoming-book button')].find(b=>b.textContent==='Dismiss').click()",
  );
  await until(
    "!document.querySelector('.incoming-book')",
    "failed import dismisses cleanly",
  );
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await send("Page.reload");
  await until("document.querySelector('.app-shell')", "app reloads offline");
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='My library').click()",
  );
  await until(
    `document.querySelector('.book-open[aria-label="MLibrary-native-${stamp}"]')`,
    "import survives restart offline",
  );
  await evaluate(
    `document.querySelector('.book-open[aria-label="MLibrary-native-${stamp}"]').click()`,
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>['Open in reader','Continue reading'].includes(b.textContent.trim())).click()",
  );
  await until(
    "document.querySelector('.pdf-page canvas')?.width > 0",
    "offline PDF reopens",
  );
  await writeFile(
    "artifacts/qdl-import-offline-reader.png",
    command(["exec-out", "screencap", "-p"]),
  );
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  console.log(
    JSON.stringify({
      result: "passed",
      book: id,
      bytes: bytes.length,
      screenshot: "artifacts/qdl-import-offline-reader.png",
    }),
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      if (originalLanguage)
        await evaluate(
          `localStorage.setItem('mlibrary:v1',JSON.stringify({...JSON.parse(localStorage.getItem('mlibrary:v1')),language:${JSON.stringify(originalLanguage)}}))`,
        );
    } catch {}
    socket.close();
  }
  for (const uri of created) {
    try {
      command(["shell", "content", "delete", "--uri", uri]);
    } catch {}
  }
}
