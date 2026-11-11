import test from "node:test";
import assert from "node:assert/strict";
import {
  searchOpenITI,
  openitiContent,
  cleanOpenITI,
} from "../server/openiti.mjs";
import { parseBookId } from "../server/content.mjs";

test("OpenITI poetry renders verse separators without changing prose percentages", () => {
  const raw =
    "######OpenITI#\n#META#Header#End#\n" +
    "# % تطاول ليلي بهم وصب % ودمع كسح السقاء السرب % 2\n" +
    "# % للعب قصي بأحلامها % % وهل يرجع الحلم بعد اللعب ؟ % 3\n" +
    "# أول البيت %~% آخر البيت\n# بلغت النسبة 50% أو 50 % من المجموع";
  const text = cleanOpenITI(raw);
  assert.ok(text.includes("تطاول ليلي بهم وصب\nودمع كسح السقاء السرب\n2"));
  assert.ok(text.includes("للعب قصي بأحلامها\nوهل يرجع الحلم بعد اللعب ؟\n3"));
  assert.ok(text.includes("أول البيت\nآخر البيت"));
  assert.ok(text.includes("50% أو 50 %"));
  assert.ok(!text.includes("%~%"));
});

test("OpenITI indexes primary Arabic editions, supports Arabic normalization and keeps edition identities", () => {
  const results = searchOpenITI({ language: "ar" });
  assert.ok(results.count >= 7000);
  assert.ok(
    results.books.every(
      (b) => b.language === "ar" && b.rights.includes("CC BY-NC-SA"),
    ),
  );
  assert.equal(
    new Set(results.books.map((b) => b.id)).size,
    results.books.length,
  );
  assert.equal(searchOpenITI({ language: "fr" }).count, 0);
  assert.ok(searchOpenITI({ q: "الغزالي", language: "ar" }).count > 0);
  for (const value of [
    "openiti:../../secret",
    "openiti:https://example.org",
    "openiti:0001A.B.C?x=1",
  ])
    assert.throws(() => parseBookId(value));
});
test("OpenITI reader validates its header and partitions large texts without dropping content", async () => {
  assert.throws(() => cleanOpenITI("<html>Not a book</html>"));
  const id = searchOpenITI({ language: "ar" }).books[0].id.slice(8);
  const raw =
    "######OpenITI#\n#META#Header#End#\n### | العنوان\n" +
    "# هذا نص عربي للاختبار.\n".repeat(40000) +
    "\nPageV01P012";
  let requests = 0;
  const fetcher = async (url) => {
    requests++;
    assert.match(
      url,
      /^https:\/\/raw\.githubusercontent\.com\/OpenITI\/RELEASE\/[a-f0-9]{40}\/data\//,
    );
    return new Response(raw);
  };
  const first = await openitiContent(id, undefined, fetcher);
  assert.ok(first.chapters.length > 1);
  let joined = "";
  for (const c of first.chapters)
    joined += (await openitiContent(id, c.id, fetcher)).text;
  assert.equal(joined, cleanOpenITI(raw));
  assert.equal(requests, 1);
  await assert.rejects(
    openitiContent(id, "https://example.org", fetcher),
    /Invalid chapter/,
  );
  await assert.rejects(
    openitiContent(id, "part-9999", fetcher),
    /Invalid chapter/,
  );
});
