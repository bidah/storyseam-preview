// The story folder, over HTTP, for the previewer only. A Vite plugin: the dev
// server answers /__story/* from the folder passed on the command line, and
// nothing else. It listens on localhost (see bin/), never on the network.
//
//   GET /__story/tree            the whole folder as a tree (dotfiles shown, .git skipped)
//   GET /__story/file?path=...   a text file's contents
//   GET /__story/files/<path>?w=N  an image resized to at most N px wide, as WebP (cached), so a
//                                4 MB sheet crosses a tunnel as ~200 KB. Without ?w, the original.
//                                An .html page's <img src> get ?w=1600 added as it is served.
//   GET /__story/files/<path>    any file's bytes (images, video, audio, html). A path, not a
//                                query, so an HTML page's relative links resolve beside it.
//   PUT /__story/file?path=...   save a text file (.md, .json, .txt only; JSON must parse).
//                                Refused outright when the preview is shared (--share, read-only).
//
// Every path is resolved inside the story root; anything that escapes it is a 403.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

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

const RESIZABLE = /\.(png|jpe?g|webp)$/i;
const CACHE = path.join(os.tmpdir(), "storyseam-preview-cache");
const WIDTHS = [240, 800, 1200, 1600, 2400];

/** A resized WebP of an image, cached by path, size, mtime and width. */
async function resized(abs, w) {
  const st = fs.statSync(abs);
  const width = WIDTHS.find((x) => x >= w) || WIDTHS[WIDTHS.length - 1];
  const key = crypto.createHash("sha1").update(`${abs}|${st.size}|${st.mtimeMs}|${width}`).digest("hex");
  const out = path.join(CACHE, `${key}.webp`);
  if (fs.existsSync(out)) return out;
  const { default: sharp } = await import("sharp");
  fs.mkdirSync(CACHE, { recursive: true });
  await sharp(abs).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(out + ".tmp");
  fs.renameSync(out + ".tmp", out);
  return out;
}

/** Add ?w=1600 to a page's relative image links, so a shot preview is light to load. */
function lighten(html) {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"?#:]+\.(?:png|jpe?g|webp))(")/gi, "$1$2?w=1600$3");
}

export function storyFs(root, { readOnly = false } = {}) {
  root = path.resolve(root);
  return {
    name: "storyseam-story-fs",
    configureServer(server) {
      // Deep links: a page load of any story path (/world, /shotlist/previews/block_02.html,
      // /config.json) gets the app, which opens what the path names (src/router.js).
      // Registered before Vite's own middleware, so a dotted name is not taken for a
      // module or a missing static file. Vite's own paths, and requests that are not a
      // browser asking for a page, pass through.
      const appHtml = path.join(server.config.root, "index.html");
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" || !(req.headers.accept || "").includes("text/html")) return next();
        const url = new URL(req.url, "http://local");
        if (url.pathname === "/" || /^\/(@|__story\/|src\/|node_modules\/|favicon)/.test(url.pathname)) return next();
        if (req.headers["sec-fetch-dest"] && req.headers["sec-fetch-dest"] !== "document") return next();
        try {
          const html = await server.transformIndexHtml(url.pathname, fs.readFileSync(appHtml, "utf8"));
          res.statusCode = 200;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(html);
        } catch (e) {
          next(e);
        }
      });

      server.middlewares.use("/__story", (req, res) => {
        const url = new URL(req.url, "http://local");
        const route = url.pathname;
        try {
          if (route === "/tree" && req.method === "GET") return send(res, 200, { root: path.basename(root), readOnly, tree: tree(root) });

          if (route.startsWith("/files/") && req.method === "GET") {
            const abs = inside(root, decodeURIComponent(route.slice("/files/".length)));
            if (!abs) return send(res, 403, { error: "outside the story folder" });
            if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return send(res, 404, { error: "not found" });
            const ext = path.extname(abs).slice(1).toLowerCase();
            const w = Number(url.searchParams.get("w")) || 0;
            if (w > 0 && RESIZABLE.test(abs)) {
              return resized(abs, w).then(
                (file) => {
                  res.setHeader("content-type", "image/webp");
                  res.setHeader("cache-control", "private, max-age=300");
                  fs.createReadStream(file).pipe(res);
                },
                () => {
                  res.setHeader("content-type", MIME[ext] || "application/octet-stream");
                  fs.createReadStream(abs).pipe(res);
                },
              );
            }
            res.setHeader("content-type", MIME[ext] || "application/octet-stream");
            res.setHeader("cache-control", "no-store");
            if (ext === "html" || ext === "htm") return res.end(lighten(fs.readFileSync(abs, "utf8")));
            return fs.createReadStream(abs).pipe(res);
          }

          const abs = inside(root, url.searchParams.get("path"));
          if (!abs) return send(res, 403, { error: "outside the story folder" });

          if (route === "/file" && req.method === "GET") {
            if (!fs.existsSync(abs)) return send(res, 404, { error: "not found" });
            if (!TEXT.test(abs) && !/^[^.]*$/.test(path.basename(abs))) return send(res, 415, { error: "not a text file" });
            return send(res, 200, fs.readFileSync(abs, "utf8"), "text/plain; charset=utf-8");
          }

          if (route === "/file" && req.method === "PUT" && readOnly) return send(res, 403, { error: "this preview is shared read-only" });
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
