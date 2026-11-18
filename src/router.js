// The URL is the state: every folder and file of the story has an address.
//
//   /                                   the desktop: an explorer on the root, storyseam.md open
//   /world                              an explorer open on world/
//   /shotlist/previews/block_02.html    that file open in its own window, its folder behind it
//
// Paths are the story-relative path, one URL segment per path segment. A window
// carries its `route`; focusing a window puts its route in the address bar
// (pushState, so Back walks back through what you looked at), and Back/Forward
// open whatever the address names. The server answers every such path with the
// app (server/fs-api.js), so a link can be pasted, bookmarked or shared.
import { setFocusListener } from "./wm.js";

let story = null;
let openFolder = null;
let openFileNode = null;
let applying = false;

export const urlFor = (p) => "/" + String(p || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");

export function currentPath() {
  return decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, "");
}

export function find(node, p) {
  if (node.path === p) return node;
  for (const c of node.children || []) {
    if (c.type === "dir" ? p === c.path || p.startsWith(c.path + "/") : c.path === p) {
      const f = find(c, p);
      if (f) return f;
    }
  }
  return null;
}

const parentOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** Open whatever a path names. Returns false when the story has no such path. */
export async function open(p) {
  const node = p ? find(story.tree, p) : story.tree;
  if (!node) return false;
  applying = true;
  try {
    if (node.type === "dir") openFolder(node.path);
    else {
      openFolder(parentOf(node.path), node.path);
      await openFileNode(node);
    }
  } finally {
    applying = false;
  }
  return true;
}

/** Put a route in the address bar, unless it is already there or we are replaying one. */
export function show(route) {
  if (applying || route == null) return;
  if (route === currentPath()) return;
  history.pushState({ route }, "", urlFor(route));
}

export async function startRouter(s, { folder, file, notFound }) {
  story = s;
  openFolder = folder;
  openFileNode = file;
  setFocusListener((win) => show(win ? win.route : ""));
  addEventListener("popstate", () => open(currentPath()).then((ok) => ok || notFound(currentPath())));
  const p = currentPath();
  if (!p) return false; // the caller lays out the default desktop
  const ok = await open(p);
  if (!ok) notFound(p);
  return true;
}
