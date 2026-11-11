import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { vaultRequest } from "../server/vault.mjs";

test("private vault authenticates every operation, enforces conditional writes and supports deletion", async () => {
  const token = randomBytes(32).toString("base64url"),
    id = createHash("sha256").update(token).digest("hex");
  const endpoint = `https://example.org/api/vault/${id}`;
  const call = (method, extra = {}, body, auth = token) =>
    vaultRequest(
      new Request(endpoint, {
        method,
        headers: { Authorization: `Bearer ${auth}`, ...extra },
        body,
      }),
      { ip: id },
    );
  assert.equal((await call("GET", {}, undefined, "bad")).status, 401);
  assert.equal((await call("GET")).status, 404);
  const body = Buffer.concat([Buffer.from("MLV1"), randomBytes(100)]);
  assert.equal(
    (await call("PUT", { "Content-Type": "application/octet-stream" }, body))
      .status,
    428,
  );
  const created = await call(
    "PUT",
    { "Content-Type": "application/octet-stream", "If-None-Match": "*" },
    body,
  );
  assert.equal(created.status, 204);
  const read = await call("GET");
  assert.deepEqual(Buffer.from(await read.arrayBuffer()), body);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal(read.headers.get("etag"), created.headers.get("etag"));
  assert.equal(
    (
      await call(
        "PUT",
        { "Content-Type": "application/octet-stream", "If-None-Match": "*" },
        body,
      )
    ).status,
    409,
  );
  const competing = await Promise.all(
    [1, 2].map(() =>
      call(
        "PUT",
        {
          "Content-Type": "application/octet-stream",
          "If-Match": created.headers.get("etag"),
        },
        body,
      ),
    ),
  );
  assert.deepEqual(competing.map((r) => r.status).sort(), [204, 409]);
  assert.equal((await call("DELETE", {}, undefined, "bad")).status, 401);
  assert.equal((await call("DELETE")).status, 204);
  assert.equal((await call("GET")).status, 404);
});

test("vault rejects oversized streams, unencrypted data, unsupported methods, and storage failures", async () => {
  const token = randomBytes(32).toString("base64url"),
    id = createHash("sha256").update(token).digest("hex");
  const endpoint = `https://example.org/api/vault/${id}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/octet-stream",
    "If-None-Match": "*",
  };
  const put = (body) => new Request(endpoint, { method: "PUT", headers, body });
  assert.equal((await vaultRequest(put("plaintext notes"))).status, 400);
  assert.equal(
    (await vaultRequest(put(Buffer.alloc(2 * 1024 * 1024 + 1)))).status,
    413,
  );
  assert.equal(
    (await vaultRequest(new Request(endpoint, { method: "POST", headers })))
      .status,
    405,
  );
  const failing = () => {
    throw new Error("private storage internals");
  };
  const result = await vaultRequest(
    new Request(endpoint, { headers }),
    {},
    failing,
  );
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes("private storage internals"));
  const preflight = await vaultRequest(
    new Request(endpoint, { method: "OPTIONS" }),
  );
  assert.ok(
    preflight.headers.get("access-control-allow-methods").includes("PUT"),
  );
});
