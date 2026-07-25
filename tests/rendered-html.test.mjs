import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the lightweight Last Bus Out launch menu", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Last Bus Out: Road to Haven<\/title>/i);
  assert.match(html, /three-dimensional survival game/i);
  assert.match(html, /Begin the escape/);
  assert.match(html, /WASD/);
  assert.match(html, /menu-screen/);
  assert.doesNotMatch(html, /game-viewport-3d/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/);
});
