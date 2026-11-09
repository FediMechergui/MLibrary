import http from "node:http";
import { spawn } from "node:child_process";
import handler from "../server/api.mjs";
const server = http.createServer(async (req, res) => {
  try {
    const response = await handler(
      new Request(`http://127.0.0.1:8889${req.url}`, { method: req.method }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end('{"error":"Local API failed"}');
  }
});
server.listen(8889, "127.0.0.1", () =>
  console.log("MLibrary API: http://127.0.0.1:8889"),
);
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(process.argv.includes("--production")
      ? ["preview", "--port", "5173", "--host", "127.0.0.1"]
      : []),
  ],
  { stdio: "inherit" },
);
function stop() {
  vite.kill();
  server.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", () => server.close());
