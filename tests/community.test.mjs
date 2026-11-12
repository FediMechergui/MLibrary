import test from "node:test";
import assert from "node:assert/strict";
import {
  parseUnglue,
  parseFadedList,
  parseGreyList,
  communityLink,
  clean,
} from "../server/community-parsers.mjs";
import {
  allowedCommunityUrl,
  searchCommunity,
  communityFileChunk,
  communityContent,
  parseSourceMonitor,
} from "../server/community.mjs";
import { parseBookId } from "../server/content.mjs";

test("Unglue namespaced metadata, language and licensed acquisition survive XML parsing", () => {
  const result = parseUnglue(
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/"><link rel="next" href="https://unglue.it/api/opds/epub/?x=1&amp;page=1"/><entry><id>https://unglue.it/api/id/work/123/</id><title>Un livre &amp; ses lecteurs</title><author><name>Une autrice</name></author><dcterms:language>fr</dcterms:language><link rel="http://opds-spec.org/acquisition/open-access" type="application/epub+zip" dcterms:rights="CC BY-SA" href="https://unglue.it/download_ebook/17/?feed=opds"/></entry></feed>`,
  );
  assert.equal(result.records[0].title, "Un livre & ses lecteurs");
  assert.deepEqual(result.records[0].authors, ["Une autrice"]);
  assert.equal(result.records[0].language, "fr");
  assert.equal(result.records[0].rights, "CC BY-SA");
  assert.match(result.next, /&page=1/);
  assert.equal(clean("A <b>real</b> title"), "A real title");
});
test("Faded Page legacy alphanumeric IDs and Global Grey numbered pagination remain usable", () => {
  const r = parseFadedList(
    '<table><tr><td><a href="/csearch.php?author=Orwell">George Orwell</a></td><td><a href="/showbook.php?pid=201410E7">Animal Farm</a></td><td>1945</td></tr></table>',
  );
  assert.equal(r.records[0].id, "fadedpage:201410E7");
  assert.equal(r.records[0].authors[0], "George Orwell");
  assert.equal(parseBookId("fadedpage:201410E7").id, "201410E7");
  assert.equal(
    parseGreyList(
      '<nav class="pager"><a aria-current="page">2</a><a href="/category/ebooks/fiction-page-3.html">3</a></nav>',
    ).next,
    "/category/ebooks/fiction-page-3.html",
  );
});
test("community links and downloads reject host confusion, credentials and unsupported redirects", () => {
  for (const url of [
    "https://unglue.it.evil.test/work/12/",
    "http://unglue.it/work/12/",
    "https://a:b@unglue.it/work/12/",
    "https://www.fadedpage.com/showbook.php?pid=../../secret",
  ])
    assert.throws(() => communityLink(url));
  assert.deepEqual(
    communityLink(
      "https://www.globalgreyebooks.com/book-page/on-liberty-ebook.html",
    ),
    { source: "globalgrey", id: "on-liberty" },
  );
  for (const url of [
    "http://files.unglue.it/ebf/abcd.epub",
    "https://files.unglue.it.evil.test/ebf/abcd.epub",
    "https://localhost/a.epub",
    "https://files.unglue.it/ebf/%2e%2e/a.epub",
  ])
    assert.equal(allowedCommunityUrl("unglue", url), false);
  assert.equal(
    allowedCommunityUrl("unglue", "https://files.unglue.it/ebf/abcd.epub"),
    true,
  );
});
test("language filters never label English candidates as Arabic", () => {
  assert.equal(
    searchCommunity({ source: "fadedpage", language: "ar" }).count,
    0,
  );
  const french = searchCommunity({
    source: "fadedpage",
    q: "feu cendre",
    language: "fr",
  });
  assert.ok(french.count > 0);
  assert.equal(french.books[0].language, "fr");
});

test("indexed Unglue EPUB acquisition is retained when individual feeds omit it", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(
      "Do not replace a verified acquisition with the MOBI-only work feed",
    );
  });
  const content = await communityContent("unglue", "140714");
  assert.equal(content.type, "remote");
  assert.equal(content.format, "epub");
  assert.match(content.url, /\/download_ebook\/2468\//);
  assert.equal(content.file.source, "unglue");
});
test("publisher session is used for download; HTML is never accepted as an EPUB", async (t) => {
  let sawSession = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).includes("showbook.php"))
      return new Response(
        '<table summary="details"><tr><td>Title:</td><td>Session test</td></tr></table><a href="link.php?file=20990101.epub">EPUB</a>',
        { headers: { "set-cookie": "PHPSESSID=test-session; Path=/" } },
      );
    sawSession = options.headers.Cookie === "PHPSESSID=test-session";
    return new Response("<html>verification</html>", {
      headers: { "content-type": "text/html" },
    });
  });
  assert.equal(
    (await communityContent("fadedpage", "20990101")).type,
    "remote",
  );
  await assert.rejects(
    communityFileChunk("fadedpage", "20990101", "epub", 0, 1023),
    /webpage instead/,
  );
  assert.ok(sawSession);
  await assert.rejects(
    communityFileChunk("fadedpage", "20990101", "epub", -1, 1023),
    /range/,
  );
});
test("availability monitor never adds arbitrary domains or interprets PROTECTED as readable", () => {
  const r = parseSourceMonitor(
    '<li><a class="domain-link" href="https://annas-archive.gd">Archive</a><span>PROTECTED</span></li><li><a class="domain-link" href="https://evil.test">UP</a></li>',
  );
  assert.equal(r.length, 3);
  assert.equal(r[0].status, "PROTECTED");
  assert.equal(r[1].status, "UNKNOWN");
});

test("unindexed Unglue works resolve the public format-selection page after a MOBI-only feed", async t => {
  const calls=[];
  t.mock.method(globalThis,"fetch",async url=>{
    calls.push(String(url));
    return new Response(String(url).includes("/api/opds/") ? '<feed><entry><id>https://unglue.it/api/id/work/2999999/</id><title>Une édition</title><author><name>Autrice</name></author><dcterms:language>fr</dcterms:language><link rel="http://opds-spec.org/acquisition/open-access" type="application/x-mobipocket-ebook" dcterms:rights="CC BY" href="https://unglue.it/download_ebook/999/"/></entry></feed>' : '<a href="/download_ebook/123/">epub at Unglue.it</a>');
  });
  const content=await communityContent("unglue","2999999");
  assert.equal(content.format,"epub");assert.equal(content.url,"https://unglue.it/download_ebook/123/");assert.equal(content.attribution,"CC BY");
  assert.equal(calls[1],"https://unglue.it/work/2999999/download/");
});
