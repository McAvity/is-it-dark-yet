// Serves dist/ under a /clock/ prefix, to check that the build works below the site root.
import { resolve, sep } from "node:path";

const PREFIX = "/clock/";
const ROOT = resolve(import.meta.dir, "..", "dist");
const headers = { "cache-control": "no-store" };
const notFound = () => new Response("Not found", { status: 404, headers });

const server = Bun.serve({
  port: 8787,
  async fetch(req) {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response("Bad request", { status: 400, headers });
    }
    if (!path.startsWith(PREFIX)) return notFound();
    const rest = path.slice(PREFIX.length) || "index.html";
    const file = resolve(ROOT, rest);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return notFound();
    const f = Bun.file(file);
    if (!(await f.exists())) return notFound();
    return new Response(f, { headers });
  },
});
console.log(`http://localhost:${server.port}${PREFIX}`);
