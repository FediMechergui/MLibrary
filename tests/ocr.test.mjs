import test from "node:test";
import assert from "node:assert/strict";
import { ocrRequest } from "../server/ocr.mjs";
import { handler as lambda } from "../netlify/functions/api.js";
const image =
  "data:image/png;base64," +
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(40),
  ]).toString("base64");
let id = 0;
const request = (body, headers = {}) =>
  new Request("https://example.test/api/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nf-client-connection-ip": `test-${id++}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("OCR keeps its credential in a fixed upstream header and sends only the selected image", async () => {
  let calls = 0;
  const response = await ocrRequest(
    request({ image, language: "ar", url: "http://127.0.0.1/private" }),
    {
      key: "private-test-secret",
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, "https://api.ocr.space/parse/image");
        assert.equal(options.headers.apikey, "private-test-secret");
        assert.equal(options.body.get("language"), "auto");
        assert.equal(options.body.get("OCREngine"), "2");
        assert.equal(options.body.get("url"), null);
        assert.equal(options.body.get("file").type, "image/png");
        return Response.json({ ParsedResults: [{ ParsedText: "كتاب جميل" }] });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), {
    text: "كتاب جميل",
    provider: "OCR.space",
    language: "ar",
  });
});
test("OCR rejects foreign origins, remote URLs, invalid formats and oversized bodies before contacting provider", async () => {
  const config = {
    key: "secret",
    fetcher: () => {
      throw new Error("Upstream must not run");
    },
  };
  for (const [body, headers, status] of [
    [{ image, language: "en" }, { origin: "https://untrusted.example" }, 403],
    [{ image: "https://example.com/book.png", language: "en" }, {}, 400],
    [{ image, language: "invalid" }, {}, 400],
    [
      {
        image: "data:image/png;base64," + Buffer.alloc(40).toString("base64"),
        language: "en",
      },
      {},
      400,
    ],
    [{ image: "A".repeat(1400001), language: "en" }, {}, 413],
  ])
    assert.equal(
      (await ocrRequest(request(body, headers), config)).status,
      status,
    );
});
test("OCR availability works for Android and unavailable/provider errors do not leak credentials", async () => {
  const enabled = await ocrRequest(
    new Request("https://example.test/api/ocr", {
      headers: { origin: "https://localhost" },
    }),
    { key: "test-secret" },
  );
  assert.equal(
    enabled.headers.get("access-control-allow-origin"),
    "https://localhost",
  );
  assert.equal((await enabled.json()).online, true);
  assert.equal(
    (await ocrRequest(request({ image, language: "en" }), { key: "" })).status,
    503,
  );
  for (const fetcher of [
    async () =>
      Response.json({
        IsErroredOnProcessing: true,
        ErrorMessage: "test-secret",
      }),
    async () => {
      throw new Error("test-secret");
    },
  ]) {
    const response = await ocrRequest(request({ image, language: "fr" }), {
      key: "test-secret",
      fetcher,
    });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /test-secret/);
  }
});
test("Netlify passes plain and base64 OCR JSON bodies to the handler", async () => {
  const old = process.env.OCR_SPACE_API_KEY;
  process.env.OCR_SPACE_API_KEY = "test-only";
  try {
    for (const base64 of [false, true]) {
      const body = JSON.stringify({ image: "invalid", language: "en" });
      const response = await lambda({
        httpMethod: "POST",
        rawUrl: "https://example.test/api/ocr",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
        },
        body: base64 ? Buffer.from(body).toString("base64") : body,
        isBase64Encoded: base64,
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /PNG or JPEG/);
    }
  } finally {
    if (old === undefined) delete process.env.OCR_SPACE_API_KEY;
    else process.env.OCR_SPACE_API_KEY = old;
  }
});
