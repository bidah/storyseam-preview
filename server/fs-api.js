// The story folder, over HTTP, for the previewer only. A Vite plugin: the dev
// server answers /__story/* from the folder passed on the command line, and
// nothing else. It listens on localhost (see bin/), never on the network.
//
//   GET /__story/tree            the whole folder as a tree (dotfiles shown, .git skipped)
//   GET /__story/file?path=...   a text file's contents
//   GET /__story/files/<path>    any file's bytes (images, video, audio, html). A path, not a
//                                query, so an HTML page's relative links resolve beside it.
//   PUT /__story/file?path=...   save a text file (.md, .json, .txt only; JSON must parse)
//
// Every path is resolved inside the story root; anything that escapes it is a 403.
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set([".git", "node_modules", ".DS_Store"]);
const EDITABLE = /\.(md|markdown|json|txt)$/i;
const TEXT = /\.(md|markdown|json|txt|yml|yaml|toml|csv|edl|mdc|js|mjs|py|sh)$/i;
const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css", js: "text/javascript",
  json: "application/json", md: "text/plain; charset=utf-8", txt: "text/plain; charset=utf-8",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};

function inside(root, rel) {
  const abs = path.resolve(root, String(rel || "").replace(/^\/+/, ""));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function tree(root, abs = root) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  const st = fs.statSync(abs);
  if (!st.isDirectory()) return { name: path.basename(abs), path: rel, type: "file", size: st.size, mtime: st.mtimeMs };
  const children = fs
    .readdirSync(abs)
    .filter((n) => !SKIP.has(n) && n !== ".gitkeep")
    .map((n) => tree(root, path.join(abs, n)))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return { name: rel ? path.basename(abs) : path.basename(root), path: rel, type: "dir", children };
}

const send = (res, code, body, type = "application/json") => {
  res.statusCode = code;
  res.setHeader("content-type", type);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

export function storyFs(root) {
  root = path.resolve(root);
  return {
    name: "storyseam-story-fs",
    configureServer(server) {
      server.middlewares.use("/__story", (req, res) => {
        const url = new URL(req.url, "http://local");
        const route = url.pathname;
        try {
          if (route === "/tree" && req.method === "GET") return send(res, 200, { root, tree: tree(root) });

          if (route.startsWith("/files/") && req.method === "GET") {
            const abs = inside(root, decodeURIComponent(route.slice("/files/".length)));
            if (!abs) return send(res, 403, { error: "outside the story folder" });
            if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 404, { error: "not found" });
            const ext = path.extname(abs).slice(1).toLowerCase();
            res.setHeader("content-type", MIME[ext] || "application/octet-stream");
            res.setHeader("cache-control", "no-store");
            return fs.createReadStream(abs).pipe(res);
          }

          const abs = inside(root, url.searchParams.get("path"));
          if (!abs) return send(res, 403, { error: "outside the story folder" });

          if (route === "/file" && req.method === "GET") {
            if (!fs.existsSync(abs)) return send(res, 404, { error: "not found" });
            if (!TEXT.test(abs) && !/^[^.]*$/.test(path.basename(abs))) return send(res, 415, { error: "not a text file" });
            return send(res, 200, fs.readFileSync(abs, "utf8"), "text/plain; charset=utf-8");
          }

          if (route === "/file" && req.method === "PUT") {
            // Only this page may write: a site open in another tab cannot PUT here.
            const origin = req.headers.origin;
            if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: "writes only from the previewer itself" });
            if (!EDITABLE.test(abs)) return send(res, 415, { error: "only .md, .json and .txt files are editable here" });
            let body = "";
            req.setEncoding("utf8");
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              if (/\.json$/i.test(abs)) {
                try {
                  JSON.parse(body);
                } catch (e) {
                  return send(res, 422, { error: `not valid JSON: ${e.message}` });
                }
              }
              fs.mkdirSync(path.dirname(abs), { recursive: true });
              fs.writeFileSync(abs, body);
              send(res, 200, { ok: true, saved: path.relative(root, abs) });
            });
            return;
          }
          send(res, 404, { error: "unknown route" });
        } catch (e) {
          send(res, 500, { error: e.message });
        }
      });
    },
  };
}
