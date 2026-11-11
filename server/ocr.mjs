const MAX_BODY = 1400000;
const recent = new Map();
const allowedOrigin = (origin) =>
  !origin ||
  [
    "https://localhost",
    "http://localhost",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://mlibrary-fedimechergui.netlify.app",
  ].includes(origin) ||
  /^https:\/\/[a-z0-9-]+--mlibrary-fedimechergui\.netlify\.app$/.test(origin);
async function boundedJson(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY)
    throw new Error("size");
  if (!request.body) throw new Error("input");
  const reader = request.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) throw new Error("size");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function ocrRequest(
  request,
  { key = process.env.OCR_SPACE_API_KEY, fetcher = fetch } = {},
) {
  const origin = request.headers.get("origin") || "";
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...(origin && allowedOrigin(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
  };
  const reply = (body, status = 200) =>
    Response.json(body, { status, headers });
  if (!allowedOrigin(origin))
    return reply({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method === "GET")
    return reply({
      online: !!key,
      provider: "OCR.space",
      maxBytes: 1000000,
      languages: ["en", "fr", "ar"],
    });
  if (request.method !== "POST")
    return reply({ error: "Method not allowed" }, 405);
  if (!key)
    return reply(
      { error: "Online OCR unavailable; use on-device recognition." },
      503,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "Expected JSON" }, 415);
  try {
    const body = await boundedJson(request);
    if (
      !["en", "fr", "ar"].includes(body.language) ||
      typeof body.image !== "string"
    )
      return reply({ error: "Invalid OCR input" }, 400);
    const match = body.image.match(
      /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) return reply({ error: "Send a PNG or JPEG crop" }, 400);
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 1000000 || bytes.length < 24)
      return reply({ error: "Image must be under 1 MB" }, 413);
    if (
      (match[1] === "png" &&
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (match[1] === "jpeg" &&
        !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))
    )
      return reply({ error: "Invalid image" }, 400);
    // Best-effort burst protection per function instance; provider quotas remain authoritative.
    const now = Date.now(),
      ip = request.headers.get("x-nf-client-connection-ip") || "development";
    for (const [id, item] of recent) if (item.until < now) recent.delete(id);
    const quota = recent.get(ip) || { until: now + 60000, count: 0 };
    if (quota.count >= 8)
      return reply(
        {
          error: "Too many scans. Wait a minute or use on-device recognition.",
        },
        429,
      );
    quota.count++;
    recent.set(ip, quota);
    if (recent.size > 2000) recent.delete(recent.keys().next().value);
    const form = new FormData();
    form.set(
      "file",
      new Blob([bytes], { type: `image/${match[1]}` }),
      `passage.${match[1]}`,
    );
    form.set("OCREngine", "2");
    form.set("language", "auto");
    form.set("isOverlayRequired", "false");
    form.set("isCreateSearchablePdf", "false");
    form.set("detectOrientation", "true");
    const response = await fetcher("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: key },
      body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok)
      return reply(
        {
          error:
            "Online OCR is temporarily unavailable. Use on-device recognition.",
        },
        response.status === 429 ? 429 : 502,
      );
    const data = await response.json();
    // Never forward provider diagnostics, headers or credentials to clients/logs.
    if (data.IsErroredOnProcessing || !Array.isArray(data.ParsedResults))
      return reply(
        {
          error:
            "The OCR provider could not read this image. Try a smaller crop or on-device recognition.",
        },
        502,
      );
    const text = data.ParsedResults.map((result) =>
      typeof result.ParsedText === "string" ? result.ParsedText : "",
    )
      .join("\n")
      .trim();
    if (text.length > 30000)
      return reply({ error: "Select a smaller passage." }, 413);
    return reply({ text, provider: "OCR.space", language: body.language });
  } catch (error) {
    return reply(
      {
        error:
          error.message === "size"
            ? "Select a smaller image area."
            : "Recognition failed. Try again or use on-device recognition.",
      },
      error.message === "size" ? 413 : error instanceof SyntaxError ? 400 : 502,
    );
  }
}
