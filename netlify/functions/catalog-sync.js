import { connectLambda } from "@netlify/blobs";
import sync from "../../server/catalog-sync.mjs";
export const handler = async (event) => {
  if (event.blobs) connectLambda(event);
  const response = await sync();
  return { statusCode: response.status, body: await response.text() };
};
