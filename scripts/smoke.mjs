const origin = process.argv[2] || "https://mlibrary-fedimechergui.netlify.app";
for (const path of [
  "/api/health",
  "/api/search?source=gutenberg&language=fr&q=hugo",
  "/api/search?source=wikisource&language=ar&q=%D8%A3%D9%84%D9%81%20%D9%84%D9%8A%D9%84%D8%A9",
  "/api/content?id=gutenberg:84",
  "/api/sync-status",
]) {
  const r = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(40000),
  });
  const body = await r.json();
  console.log(
    JSON.stringify({
      path,
      status: r.status,
      books: body.books?.length,
      counts: body.sources,
      errors: body.errors,
      characters: body.text?.length,
      summary: !body.books && !body.text ? body : undefined,
    }),
  );
  if (!r.ok) process.exitCode = 1;
}
