import { API } from "./api";
import type { Language } from "../types";
export async function onlineOcrAvailable(signal?: AbortSignal) {
  try {
    const response = await fetch(`${API}/api/ocr`, {
      signal: signal || AbortSignal.timeout(6000),
    });
    return response.ok && !!(await response.json()).online;
  } catch {
    return false;
  }
}
export async function recognizeImage(
  image: HTMLCanvasElement,
  language: Language,
  method: "local" | "online",
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (method === "online") {
    // A bounded JPEG keeps the crop within OCR.space's free upload limit.
    const copy = document.createElement("canvas");
    const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
    copy.width = Math.round(image.width * scale);
    copy.height = Math.round(image.height * scale);
    copy.getContext("2d")!.drawImage(image, 0, 0, copy.width, copy.height);
    let data = "";
    for (const quality of [0.92, 0.8, 0.65, 0.45]) {
      data = copy.toDataURL("image/jpeg", quality);
      if (data.length < 1300000) break;
    }
    if (data.length >= 1300000) throw new Error("Select a smaller area");
    progress(0.2);
    const response = await fetch(`${API}/api/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: data, language }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    const result = await response.json();
    if (!response.ok) throw new Error("Online OCR failed");
    progress(1);
    return String(result.text || "");
  }
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  signal = AbortSignal.any([signal, AbortSignal.timeout(90000)]);
  signal.throwIfAborted();
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let rejectAbort: (error: Error) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    void worker?.terminate();
    rejectAbort(new DOMException("Cancelled", "AbortError"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const loading = createWorker(
      { en: "eng", fr: "fra", ar: "ara" }[language],
      OEM.LSTM_ONLY,
      {
        workerPath: new URL("/ocr/worker.min.js", location.origin).href,
        corePath: new URL("/ocr/core", location.origin).href,
        langPath: new URL("/ocr/lang", location.origin).href,
        gzip: false,
        logger: (event) => {
          if (event.status === "recognizing text") progress(event.progress);
        },
        errorHandler: () => rejectAbort(new Error("On-device OCR failed")),
      },
    );
    void loading.then(
      (created) => {
        if (signal.aborted) void created.terminate();
      },
      () => {},
    );
    worker = await Promise.race([loading, cancelled]);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const result = await Promise.race([worker.recognize(image), cancelled]);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    progress(1);
    return result.data.text;
  } finally {
    signal.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
