#!/usr/bin/env node
// npx github:bidah/storyseam-preview [story-folder] [--port 4317] [--no-open] [--host] [--share]
//
// Starts the previewer against a story folder (default: the current directory).
// It serves on 127.0.0.1 only: the folder is yours, not the network's.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const port = Number(flag("--port")) || 4317;
const noOpen = args.includes("--no-open");
// --share: read-only (no file can be saved) and any Host accepted, so a tunnel can
// put it on the internet: `cloudflared tunnel --url http://127.0.0.1:<port>`.
const share = args.includes("--share");
if (share) process.env.STORYSEAM_READONLY = "1";
// --host: also listen on the network, so a link opens on another device. Off by default.
const host = args.includes("--host") ? "0.0.0.0" : "127.0.0.1";
const folder = path.resolve(args.find((a) => !a.startsWith("--")) || process.cwd());

if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`storyseam-preview: ${folder} is not a folder`);
  process.exit(1);
}
if (share) console.log("storyseam-preview: --share — read-only, any host (for a tunnel)");
const isStory = fs.existsSync(path.join(folder, "config.json")) &&
  (fs.existsSync(path.join(folder, "storyseam.md")) || fs.existsSync(path.join(folder, "STORY.md")));
if (!isStory) console.warn(`storyseam-preview: ${folder} has no storyseam.md + config.json; previewing it as a plain folder`);

process.env.STORYSEAM_ROOT = folder;
const server = await createServer({
  root: app,
  configFile: path.join(app, "vite.config.js"),
  server: { port, host, open: !noOpen },
  logLevel: "warn",
});
await server.listen();
const urls = [...(server.resolvedUrls?.local || []), ...(server.resolvedUrls?.network || [])];
console.log(`storyseam-preview: ${folder}\n${(urls.length ? urls : [`http://127.0.0.1:${port}/`]).map((u) => `  ${u}`).join("\n")}\n  every folder and file has its own URL, e.g. ${urls[0] || ""}world`);
