// Per-provider operational settings. Bounds keep requests within the function budget.
const defaults = {
  gutenberg: { timeoutMs: 10000, retries: 1 },
  wikisource: { timeoutMs: 8000, retries: 1 },
  openlibrary: { timeoutMs: 10000, retries: 1 },
  archive: { timeoutMs: 12000, retries: 1 },
  standardebooks: { timeoutMs: 10000, retries: 1 },
};
export function sourcePolicy(source) {
  let overrides = {};
  try {
    overrides = JSON.parse(process.env.SOURCE_POLICIES || "{}")[source] || {};
  } catch {
    /* Invalid operator settings use tested defaults. */
  }
  const base = defaults[source] || { timeoutMs: 8000, retries: 0 };
  return {
    timeoutMs: Number.isInteger(overrides.timeoutMs)
      ? Math.max(2000, Math.min(15000, overrides.timeoutMs))
      : base.timeoutMs,
    retries: Number.isInteger(overrides.retries)
      ? Math.max(0, Math.min(1, overrides.retries))
      : base.retries,
  };
}
export function sourceFromUrl(value) {
  const host = new URL(value).hostname;
  if (host === "standardebooks.org") return "standardebooks";
  return host.endsWith(".wikisource.org")
    ? "wikisource"
    : host.includes("gutenberg.org")
      ? "gutenberg"
      : host === "openlibrary.org"
        ? "openlibrary"
        : host === "archive.org" || host.endsWith(".archive.org")
          ? "archive"
          : "directory";
}
export function diagnose(error) {
  const status =
    error.status || Number(/Source returned (\d+)/.exec(error.message)?.[1]);
  if (status === 401 || status === 403)
    return {
      code: "access",
      message:
        "The source requires access approval or a browser verification. Choose another edition or import your copy.",
    };
  if (status === 429)
    return {
      code: "rate-limit",
      message:
        "The source is limiting requests. Wait a little before retrying, or choose another source.",
    };
  if (status === 404)
    return {
      code: "missing",
      message:
        "This file is no longer available at the source. Try another format or edition.",
    };
  if (["TimeoutError", "AbortError"].includes(error.name))
    return {
      code: "timeout",
      message:
        "The source took too long to respond. Retry, choose a smaller format, or use another edition.",
    };
  if (error instanceof TypeError)
    return {
      code: "connection",
      message: "The source connection failed. Check your connection and retry.",
    };
  return {
    code: "source",
    message: error.message || "The source is temporarily unavailable.",
  };
}
