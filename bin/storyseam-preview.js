#!/usr/bin/env node
// npx github:bidah/storyseam-preview [story-folder] [--port 4317] [--no-open]
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
const folder = path.resolve(args.find((a) => !a.startsWith("--")) || process.cwd());

if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`storyseam-preview: ${folder} is not a folder`);
  process.exit(1);
}
const isStory = fs.existsSync(path.join(folder, "config.json")) &&
  (fs.existsSync(path.join(folder, "storyseam.md")) || fs.existsSync(path.join(folder, "STORY.md")));
if (!isStory) console.warn(`storyseam-preview: ${folder} has no storyseam.md + config.json; previewing it as a plain folder`);

process.env.STORYSEAM_ROOT = folder;
const server = await createServer({
  root: app,
  configFile: path.join(app, "vite.config.js"),
  server: { port, open: !noOpen },
  logLevel: "warn",
});
await server.listen();
const url = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${port}/`;
console.log(`storyseam-preview: ${folder}\n  ${url}`);
