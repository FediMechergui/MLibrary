import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
// Connect directly to the app's forwarded WebView. Android WebViews do not
// implement browser-level context/download management used by desktop runners.
const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const target = targets.find((t) => t.type === "page");
if (!target)
  throw new Error(
    "No Android WebView found. Launch the debug APK and forward its devtools socket first.",
  );
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method} ${params.expression || ""}`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const data = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (data.exceptionDetails) throw new Error(data.exceptionDetails.text);
  return data.result.value;
}
async function until(expression, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${expression})`)) {
      console.log(`PASS: ${label}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Android assertion failed: ${label}`);
}
async function click(label) {
  const expression = `Array.from(document.querySelectorAll('button')).find(b => !b.disabled && (b.getAttribute('aria-label') || b.textContent.trim()) === ${JSON.stringify(label)})`;
  await until(`Boolean(${expression})`, `${label} enabled`);
  await evaluate(
    `(() => { const button = ${expression}; button.click(); return true; })()`,
  );
}
async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`artifacts/${name}.png`, Buffer.from(data, "base64"));
}
async function reload() {
  await evaluate("window.__androidSmokeReload = true");
  await send("Page.reload");
  await until("window.__androidSmokeReload !== true", "new document loaded");
}
try {
  if (process.argv.includes("--reset")) {
    // Explicit opt-in: use only on a disposable test emulator.
    await evaluate(`document.querySelector('.reader-topbar button')?.click()`);
    await until(
      `!document.querySelector('.reader')`,
      "reader closed before reset",
    );
    await evaluate(`localStorage.removeItem('mlibrary:v1')`);
    await reload();
  }
  await until(
    `document.querySelector('h1')?.textContent.includes('So many worlds.')`,
    "home",
  );
  assert.equal(await evaluate("window.Capacitor.isNativePlatform()"), true);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth > innerWidth"),
    false,
  );
  await screenshot("android-home-webview");
  await evaluate(`document.querySelector('.book-grid .book-open').click()`);
  await click("Start reading");
  await until(
    `document.querySelector('.text-page')?.textContent.includes('Project Gutenberg')`,
    "book text",
  );
  await click("Next page");
  await until(
    `document.querySelector('.page-indicator')?.textContent.includes('Page 2')`,
    "page turn",
  );
  await click("Reading settings");
  await click("Night");
  await until(
    `document.querySelector('.reader')?.classList.contains('theme-night')`,
    "night theme",
  );
  await click("Save offline");
  await until(
    `Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Saved offline' && b.disabled)`,
    "offline save",
  );
  await click("Close");
  await screenshot("android-reader-webview");
  await click("Back to library");
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await reload();
  await until(
    `document.querySelector('.book-grid .book-open')`,
    "offline app reload",
  );
  await evaluate(`document.querySelector('.book-grid .book-open').click()`);
  await click("Continue reading");
  await until(
    `document.querySelector('.text-page')?.textContent.length > 10`,
    "offline reader after reload",
  );
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  if (process.argv.includes("--notes")) {
    await evaluate(
      `(() => { const el = document.querySelector('[data-reading-text]'); const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(100, node.textContent.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(range); el.dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); })()`,
    );
    await until(
      `document.querySelector('.mark-editor')`,
      "native passage selection",
    );
    await evaluate(
      `(() => { const input = document.querySelector('.mark-editor textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'A passage to return to.'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await click("Save quote");
    await until(
      `document.querySelector('.text-page mark')`,
      "native persistent highlight",
    );
    await click("Back to library");
    await evaluate(
      `Array.from(document.querySelectorAll('.nav-item')).find(b => b.textContent.includes('My Quotes')).click()`,
    );
    await until(
      `document.querySelector('.quote-card')`,
      "native My Quotes card",
    );
    await screenshot("android-myquotes-webview");
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}/platform-tools/adb.exe`
      : `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
    const serial = process.env.ANDROID_SERIAL || "emulator-5564";
    const device = (...args) =>
      execFileSync(adb, ["-s", serial, ...args], {
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      });
    await click("Share card");
    let shared = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const activity = device("shell", "dumpsys", "activity", "activities");
      if (/ChooserActivity/.test(activity)) {
        shared = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(shared, true, "Android native share chooser opens");
    device("shell", "screencap", "-p", "/sdcard/mlibrary-share-test.png");
    device(
      "pull",
      "/sdcard/mlibrary-share-test.png",
      "artifacts/android-native-share.png",
    );
    device("shell", "input", "keyevent", "4");
    console.log(
      "PASS: Native PNG generation, file provider, and Android share chooser.",
    );
    await click("Our sources");
    await until(`document.querySelector('.source-row')`, "source directory");
    await evaluate(
      `document.querySelector('.source-row .text-button').click()`,
    );
    await click("Open source reader");
    let sourceOpen = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const activity =
        device("shell", "dumpsys", "activity", "activities")
          .split("\n")
          .find((line) => /topResumedActivity|mResumedActivity/.test(line)) ||
        "";
      if (/OSIABWebViewActivity/.test(activity)) {
        sourceOpen = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(sourceOpen, true, "Source opens in the native in-app browser");
    device("shell", "uiautomator", "dump", "/sdcard/mlibrary-source-ui.xml");
    const sourceUI = device("shell", "cat", "/sdcard/mlibrary-source-ui.xml");
    const closeNode = sourceUI.match(
      /<node[^>]*resource-id="app\.mlibrary\.reader:id\/close_button"[^>]*>/,
    )?.[0];
    const bounds = closeNode?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(bounds, "Native source toolbar has the MLibrary return button");
    device("shell", "screencap", "-p", "/sdcard/mlibrary-source-test.png");
    device(
      "pull",
      "/sdcard/mlibrary-source-test.png",
      "artifacts/android-native-source.png",
    );
    device(
      "shell",
      "input",
      "tap",
      String(Math.round((Number(bounds[1]) + Number(bounds[3])) / 2)),
      String(Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)),
    );
    let returned = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const activity =
        device("shell", "dumpsys", "activity", "activities")
          .split("\n")
          .find((line) => /topResumedActivity|mResumedActivity/.test(line)) ||
        "";
      if (/app.mlibrary.reader\/\.MainActivity/.test(activity)) {
        returned = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(
      returned,
      true,
      "MLibrary resumes after the source browser closes",
    );
    await until(
      `document.querySelector('.source-panel')`,
      "return from native source reader",
    );
    await click("Back");
    await click("Discover");
    console.log(
      "PASS: Source reader stays inside the Android app and returns to MLibrary.",
    );
  } else await click("Back to library");
  await evaluate(
    `(() => {const el = document.querySelector('select[aria-label="Language"]'); el.value='ar'; el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await until(`document.documentElement.dir === 'rtl'`, "Arabic RTL");
  await screenshot("android-arabic-webview");
  console.log(
    "PASS: Android native runtime, home, no overflow, text reader, page turn, night theme, offline saving, and Arabic RTL.",
  );
} catch (error) {
  console.error(error);
  await screenshot("android-failure").catch(() => {});
  throw error;
} finally {
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }).catch(() => {});
  socket.close();
}
