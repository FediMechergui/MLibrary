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
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
};
