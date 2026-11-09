import { refreshIndex } from "./gutenberg.mjs";
import { store } from "./storage.mjs";
export default async function sync() {
  try {
    return Response.json(await refreshIndex());
  } catch (error) {
    const s = store();
    const old = (await s.get("sync/state", { type: "json" })) || {};
    await s.setJSON("sync/state", {
      ...old,
      status: "retrying",
      lastAttempt: new Date().toISOString(),
      error: "Upstream unavailable; previous snapshot retained.",
    });
    console.error("Catalogue refresh:", error.message);
    return new Response("Previous complete catalogue retained.", {
      status: 502,
    });
  }
}
