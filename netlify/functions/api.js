import { connectLambda } from "@netlify/blobs";
import api from "../../server/api.mjs";
export const handler = async (event) => {
  if (event.blobs) connectLambda(event);
  const response = await api(
    new Request(event.rawUrl || `https://mlibrary.local${event.path}`, {
      method: event.httpMethod,
      headers: event.headers,
    }),
  );
  const binary =
    response.headers.get("content-type") === "application/octet-stream";
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: binary
      ? Buffer.from(await response.arrayBuffer()).toString("base64")
      : await response.text(),
    ...(binary ? { isBase64Encoded: true } : {}),
  };
};
