import { connectLambda } from "@netlify/blobs";
import { gzipSync } from "node:zlib";
import { downloadOpenAccessSnapshot } from "../../server/openaccess-feed.mjs";
import { store } from "../../server/storage.mjs";
export const handler = async (event) => {
  if (event.blobs) connectLambda(event);
  const storage = store();
  try {
    const snapshot = await downloadOpenAccessSnapshot();
    await storage.set(
      "catalog/openaccess/index.gz",
      gzipSync(JSON.stringify(snapshot)),
    );
    await storage.setJSON("sync/openaccess", {
      status: "ok",
      records: snapshot.rows.length,
      lastSuccess: snapshot.updatedAt,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ records: snapshot.rows.length }),
    };
  } catch (error) {
    console.error("Open-access refresh failed:", error.message);
    return {
      statusCode: 502,
      body: "Previous complete open-access catalogue retained.",
    };
  }
};
