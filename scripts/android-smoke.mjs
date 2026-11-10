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
    awaitPromise: true,
  });
  if (data.exceptionDetails)
    throw new Error(
      data.exceptionDetails.exception?.description ||
        data.exceptionDetails.text,
    );
  return data.result.value;
}
async function until(expression, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
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
  const expression = `Array.from(document.querySelectorAll('button')).find(b => !b.disabled && (b.getAttribute('aria-label') || (b.matches('.nav-item') ? b.querySelector('span')?.textContent.trim() : b.textContent.trim())) === ${JSON.stringify(label)})`;
  await until(`Boolean(${expression})`, `${label} enabled`);
  await evaluate(
    `(() => { const button = ${expression}; button.click(); return true; })()`,
  );
}
async function screenshot(name) {
  await evaluate(
    `Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`,
  );
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(`artifacts/${name}.png`, Buffer.from(data, "base64"));
}
async function assertScanPixels() {
  await until(
    `(() => { const c=document.querySelector('.pdf-reader canvas'); if(!c) return false;const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<p.length;i+=64) if(p[i+3]>0 && Math.min(p[i],p[i+1],p[i+2])<210) ink++;return ink>100; })()`,
    "actual scanned page image pixels",
  );
}
async function turnPublisherPage() {
  const savedCfi = `JSON.parse(localStorage.getItem('mlibrary:v1')).shelf['standardebooks:jane-austen/pride-and-prejudice']?.progress?.cfi`;
  await until(savedCfi, "publisher reading position available");
  const before = await evaluate(savedCfi);
  await click("Next page");
  await until(
    `${savedCfi} !== ${JSON.stringify(before)}`,
    "publisher page actually changes",
  );
  await until(
    `(() => {
    const frame=document.querySelector('.epub-reader iframe');
    if(!frame?.contentDocument?.body) return false;
    const bounds=frame.getBoundingClientRect();
    const clip=document.querySelector('.epub-reader').getBoundingClientRect();
    const d=frame.contentDocument, w=d.defaultView;
    const walker=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT);
    let node, letters=0;
    while(node=walker.nextNode()) {
      if(!node.textContent.trim() || parseFloat(w.getComputedStyle(node.parentElement).fontSize)<1) continue;
      const range=d.createRange(); range.selectNodeContents(node);
      if([...range.getClientRects()].some(r=>r.width>0 && r.height>0 && r.right+bounds.left>clip.left && r.left+bounds.left<clip.right && r.bottom+bounds.top>clip.top && r.top+bounds.top<clip.bottom)) letters+=node.textContent.trim().length;
    }
    return letters>40;
  })()`,
    "publisher text is visible inside the reader viewport",
  );
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
    await evaluate(
      `new Promise((resolve, reject) => { const request=indexedDB.open('keyval-store'); request.onupgradeneeded=()=>request.result.createObjectStore('keyval'); request.onerror=()=>reject(request.error); request.onsuccess=()=>{ const database=request.result; if(!database.objectStoreNames.contains('keyval')) { database.close(); resolve(); return; } const tx=database.transaction('keyval','readwrite');tx.objectStore('keyval').clear();tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);};})`,
    );
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
  if (
    !process.argv.includes("--downloads-only") &&
    !process.argv.includes("--publisher-only") &&
    !process.argv.includes("--openaccess-only") &&
    !process.argv.includes("--collections-only")
  ) {
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
      if (process.argv.includes("--sources")) {
        await click("Our sources");
        await until(
          `document.querySelector('.source-row')`,
          "source directory",
        );
        await evaluate(
          `document.querySelector('.source-row .text-button').click()`,
        );
        await click("Open source reader");
        let sourceOpen = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          const activity =
            device("shell", "dumpsys", "activity", "activities")
              .split("\n")
              .find((line) =>
                /topResumedActivity|mResumedActivity/.test(line),
              ) || "";
          if (/OSIABWebViewActivity/.test(activity)) {
            sourceOpen = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 400));
        }
        assert.equal(
          sourceOpen,
          true,
          "Source opens in the native in-app browser",
        );
        device(
          "shell",
          "uiautomator",
          "dump",
          "/sdcard/mlibrary-source-ui.xml",
        );
        const sourceUI = device(
          "shell",
          "cat",
          "/sdcard/mlibrary-source-ui.xml",
        );
        const closeNode = sourceUI.match(
          /<node[^>]*resource-id="app\.mlibrary\.reader:id\/close_button"[^>]*>/,
        )?.[0];
        const bounds = closeNode?.match(
          /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
        );
        assert.ok(
          bounds,
          "Native source toolbar has the MLibrary return button",
        );
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
              .find((line) =>
                /topResumedActivity|mResumedActivity/.test(line),
              ) || "";
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
      } else await click("Discover");
    } else await click("Back to library");
  } else await send("Network.enable");
  if (process.argv.includes("--books")) {
    await evaluate(
      `(() => { const s=JSON.parse(localStorage.getItem('mlibrary:v1')); const books=[{id:'openlibrary:OL5040656W',title:'Abroad',authors:['Thomas Crane'],source:'openlibrary',sourceUrl:'https://openlibrary.org/works/OL5040656W'},{id:'archive:norwegianwood0000mura',title:'Norwegian Wood',authors:['Haruki Murakami'],source:'archive',sourceUrl:'https://archive.org/details/norwegianwood0000mura'}]; for(const b of books) s.shelf[b.id]={book:{...b,language:'en',languages:['en'],cover:null,subjects:[],description:'',access:'source',rights:'Source availability checked when opened',formats:[]},addedAt:Date.now(),status:'want',bookmarks:[],offline:false,tags:[]};localStorage.setItem('mlibrary:v1',JSON.stringify(s)); })()`,
    );
    await reload();
    await until(
      `document.querySelector('.nav-item')`,
      "library ready for online book checks",
    );
    await evaluate(
      `Array.from(document.querySelectorAll('.nav-item')).find(b=>b.textContent.includes('My library')).click()`,
    );
    await until(
      `document.querySelector('.book-open[aria-label="Abroad"]')`,
      "Open Library edition on test shelf",
    );
    await evaluate(
      `document.querySelector('.book-open[aria-label="Abroad"]').click()`,
    );
    await click("Open in reader");
    await until(
      `document.querySelector('.text-page')?.textContent.trim().length > 0`,
      "actual Open Library book text in MLibrary reader",
    );
    assert.equal(
      await evaluate(
        `Boolean(document.querySelector('.source-reader, .reader iframe'))`,
      ),
      false,
    );
    await click("Next page");
    await until(
      `document.querySelector('.page-indicator')?.textContent.includes('Page 2')`,
      "online edition uses our page controls",
    );
    await screenshot("android-online-book-native-reader");
    await click("Back to library");
    await evaluate(
      `document.querySelector('.book-open[aria-label="Norwegian Wood"]').click()`,
    );
    await click("Open in reader");
    await until(
      `document.querySelector('.unavailable-edition')`,
      "restricted edition is explicitly unavailable",
    );
    assert.equal(
      await evaluate(
        `Boolean(document.querySelector('.source-reader, .reader iframe'))`,
      ),
      false,
    );
    await click("Back to library");
    await click("Discover");
    console.log(
      "PASS: Real online books open in MLibrary's own reader; restricted books do not launch a website.",
    );
  }
  if (
    process.argv.includes("--downloads") ||
    process.argv.includes("--downloads-only")
  ) {
    // Select PDF through the real per-source preference. Both edition metadata
    // and file bytes come from the deployed production backend.
    const identifier = "abroadcranethoma00craniala";
    const id = `archive:${identifier}`;
    await evaluate(
      `if (!localStorage.getItem('mlibrary:v1')) localStorage.setItem('mlibrary:v1',JSON.stringify({version:1,shelf:{}}));`,
    );
    await evaluate(
      `(() => { const s=JSON.parse(localStorage.getItem('mlibrary:v1')); s.sources={...s.sources,archive:{format:'pdf'}}; s.shelf[${JSON.stringify(id)}]={book:{id:${JSON.stringify(id)},title:'Abroad PDF',authors:['Thomas Crane'],source:'archive',language:'en',languages:['en'],cover:null,sourceUrl:'https://archive.org/details/${identifier}',subjects:[],description:'',access:'source',rights:'Public source file',formats:['PDF']},addedAt:Date.now(),status:'want',bookmarks:[],offline:false,tags:[]};localStorage.setItem('mlibrary:v1',JSON.stringify(s)); const db=indexedDB.open('keyval-store');db.onsuccess=()=>{const tx=db.result.transaction('keyval','readwrite');tx.objectStore('keyval').delete('book:${id}');tx.oncomplete=()=>{db.result.close();window.__downloadTestReady=true;};}; })()`,
    );
    await until(`window.__downloadTestReady`, "download fixture cache cleared");
    await reload();
    await until(`document.querySelector('.nav-item')`, "download shelf loaded");
    await evaluate(
      `Array.from(document.querySelectorAll('.nav-item')).find(b=>b.textContent.includes('My library')).click()`,
    );
    await until(
      `document.querySelector('.book-open[aria-label="Abroad PDF"]')`,
      "download-only book available",
    );
    await evaluate(
      `document.querySelector('.book-open[aria-label="Abroad PDF"]').click()`,
    );
    await click("Open in reader");
    await until(
      `document.querySelector('.reader-message')?.textContent.includes('Downloading your book')`,
      "automatic download begins",
    );
    await until(
      `document.querySelector('.pdf-reader canvas')?.width > 0 && document.querySelector('button[aria-label="Next page"]:not([disabled])')`,
      "downloaded PDF opens automatically",
      180000,
    );
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem('mlibrary:v1')).shelf[${JSON.stringify(id)}].offline`,
      ),
      true,
    );
    await click("Next page");
    await until(
      `document.querySelector('.page-indicator')?.textContent.includes('Page 2')`,
      "downloaded PDF page turn",
    );
    await assertScanPixels();
    await screenshot("android-auto-import-pdf");
    await click("Back to library");
    await send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await reload();
    await until(`document.querySelector('.nav-item')`, "app reopens offline");
    await evaluate(
      `Array.from(document.querySelectorAll('.nav-item')).find(b=>b.textContent.includes('My library')).click()`,
    );
    await until(
      `document.querySelector('.book-open[aria-label="Abroad PDF"]')`,
      "imported book on offline shelf",
    );
    await evaluate(
      `document.querySelector('.book-open[aria-label="Abroad PDF"]').click()`,
    );
    await click("Continue reading");
    await until(
      `document.querySelector('.pdf-reader canvas')?.width > 0 && document.querySelector('button[aria-label="Next page"]:not([disabled])')`,
      "saved PDF blob reopens offline",
    );
    await click("Next page");
    await until(
      `document.querySelector('.page-indicator')?.textContent.includes('Page 3')`,
      "offline imported PDF page turn",
    );
    await assertScanPixels();
    await screenshot("android-auto-import-offline");
    await click("Back to library");
    await send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await click("Discover");
    console.log(
      "PASS: Actual source PDF downloads, imports automatically, and survives offline app reload.",
    );
  }
  if (process.argv.includes("--publisher-only")) {
    await click("Our sources");
    await until(
      `document.querySelector('[data-source="standardebooks"] summary')`,
      "publisher source settings",
    );
    await evaluate(
      `document.querySelector('[data-source="standardebooks"] summary').click()`,
    );
    await evaluate(`document.querySelector('.publisher-import input').focus()`);
    await send("Input.insertText", {
      text: "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice",
    });
    await click("Download & read");
    await until(
      `document.querySelector('.epub-reader iframe') && document.querySelector('button[aria-label="Next page"]:not([disabled])')`,
      "real publisher EPUB opens automatically",
      180000,
    );
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem('mlibrary:v1')).shelf['standardebooks:jane-austen/pride-and-prejudice'].offline`,
      ),
      true,
    );
    await until(
      `document.querySelector('.page-indicator')?.textContent.includes('Page 1 of 1')`,
      "publisher title fits one page",
    );
    await turnPublisherPage();
    await screenshot("android-publisher-reader");
    await click("Back to library");
    await send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await reload();
    await until(
      `document.querySelector('.nav-item')`,
      "offline publisher app reload",
    );
    await click("My library");
    await evaluate(`document.querySelector('.book-grid .book-open').click()`);
    await click("Continue reading");
    await until(
      `document.querySelector('.epub-reader iframe') && document.querySelector('button[aria-label="Next page"]:not([disabled])')`,
      "publisher EPUB reopens offline",
    );
    await turnPublisherPage();
    await screenshot("android-publisher-offline");
    await click("Back to library");
    await send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await click("Discover");
    console.log(
      "PASS: Real Standard Ebooks link downloads, imports, opens book text and reopens offline.",
    );
  }
  if (
    process.argv.includes("--openaccess-only") ||
    process.argv.includes("--collections-only")
  ) {
    const samples = process.argv.includes("--collections-only")
      ? [
          [
            "gallica",
            "https://gallica.bnf.fr/ark:/12148/bpt6k5493777b",
            "bpt6k5493777b",
            "Germinal",
            "text",
          ],
          [
            "hindawi",
            "https://www.safahat.org/books/86869064/",
            "86869064",
            "الشهاب الراصد",
            "pdf",
          ],
        ]
      : [
          [
            "oapen",
            "https://library.oapen.org/handle/20.500.12657/25287",
            "25287",
            "The deliverance of open access books",
            "text",
          ],
          [
            "doab",
            "https://directory.doabooks.org/handle/20.500.12854/62823",
            "62823",
            "A World of Nourishment",
            "pdf",
          ],
        ];
    for (const [source, link, id, title, format] of samples) {
      await click("Our sources");
      const panel = `[data-source="${source}"]`;
      await until(
        `document.querySelector('${panel} summary')`,
        `${source} settings`,
      );
      await evaluate(`document.querySelector('${panel} summary').click()`);
      await evaluate(
        `document.querySelector('${panel} input[type="url"]').focus()`,
      );
      await send("Input.insertText", {
        text: link,
      });
      await until(
        `document.querySelector('${panel} input[type="url"]').value === ${JSON.stringify(link)}`,
        `${source} link entered`,
      );
      await evaluate(
        `document.querySelector('${panel} .publisher-import button').click()`,
      );
      const ready =
        format === "text"
          ? `document.querySelector('.text-page')?.textContent.length > 20`
          : `document.querySelector('.pdf-reader canvas')`;
      await until(ready, `${source} real book opens inside the reader`, 180000);
      await until(
        `JSON.parse(localStorage.getItem('mlibrary:v1')).shelf['${source}:${id}']?.offline`,
        `${source} complete download saved`,
      );
      if (format === "pdf") await assertScanPixels();
      await screenshot(`android-${source}-reader`);
      await click("Back to library");
      await send("Network.enable");
      await send("Network.emulateNetworkConditions", {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });
      await reload();
      await until(`document.querySelector('.nav-item')`, "offline app loaded");
      await click("My library");
      const selector = `.book-grid .book-open[aria-label=${JSON.stringify(title)}]`;
      await until(
        `document.querySelector(${JSON.stringify(selector)})`,
        `${source} offline shelf`,
      );
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).click()`,
      );
      await click("Continue reading");
      await until(ready, `${source} reopens offline`);
      await click("Next page");
      await until(
        `document.querySelector('.page-indicator')?.textContent.includes('Page 2')`,
        `${source} offline page turn`,
      );
      if (format === "pdf") {
        // This publisher edition deliberately leaves its second leaf blank.
        await click("Next page");
        await until(
          `document.querySelector('.page-indicator')?.textContent.includes('Page 3')`,
          `${source} printed page reached`,
        );
        await assertScanPixels();
      }
      await writeFile(
        `artifacts/android-${source}-offline.png`,
        execFileSync(
          process.env.ADB_PATH ||
            "C:/Users/fedim/AppData/Local/Android/Sdk/platform-tools/adb.exe",
          [
            "-s",
            process.env.ANDROID_SERIAL || "emulator-5564",
            "exec-out",
            "screencap",
            "-p",
          ],
          { maxBuffer: 12 * 1024 * 1024 },
        ),
      );
      await click("Back to library");
      await send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await click("Discover");
    }
    console.log(
      `PASS: Real ${samples.map((s) => s[0]).join(" and ")} books download, render and turn pages offline on Android.`,
    );
  }
  await evaluate(
    `(() => {const el = document.querySelector('select[aria-label="Language"]'); el.value='ar'; el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await until(`document.documentElement.dir === 'rtl'`, "Arabic RTL");
  await screenshot("android-arabic-webview");
  console.log(
    process.argv.includes("--downloads-only")
      ? "PASS: Android native runtime, automatic download/import, offline PDF reading, and Arabic RTL."
      : process.argv.includes("--publisher-only")
        ? "PASS: Android native runtime, publisher EPUB download/import, offline reading, and Arabic RTL."
        : process.argv.includes("--openaccess-only") ||
            process.argv.includes("--collections-only")
          ? "PASS: Android native runtime, public repository downloads, offline reading, and Arabic RTL."
          : "PASS: Android native runtime, home, no overflow, text reader, page turn, night theme, offline saving, and Arabic RTL.",
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
