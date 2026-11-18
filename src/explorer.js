// The explorer window: an address bar, a sidebar tree of the whole story, the
// open folder as an icon grid, and a preview pane for the selected file.
// Double-click a folder to go in; double-click a file to open it in its own window.
import { icon, iconFor } from "./icons.js";
import { galleryView, h, raw, viewerFor } from "./viewers.js";
import { allWindows, getWindow, openWindow, routeChanged, setTitle } from "./wm.js";
import { find } from "./router.js";
const parentOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export function openExplorer(story, startPath = "") {
  const root = story.tree;
  let cwd = startPath;
  let selected = null;
  const history = [];

  const back = h("button", { type: "button", class: "ibtn", "aria-label": "Back", html: icon("back", 14) });
  const up = h("button", { type: "button", class: "ibtn", "aria-label": "Up one folder", html: icon("up", 14) });
  const crumbs = h("div", { class: "crumbs" });
  const side = h("nav", { class: "side", "aria-label": "Folders" });
  const grid = h("div", { class: "grid", role: "listbox", "aria-label": "Folder contents" });
  const pane = h("aside", { class: "pane", "aria-label": "Preview" });
  const body = h(
    "div",
    { class: "explorer" },
    h("div", { class: "addr" }, back, up, crumbs),
    h("div", { class: "explorer__main" }, side, grid, pane),
  );
  const win = openWindow({ title: root.name, iconName: "explorer", body, width: 1080, height: 640, route: startPath });

  const go = (p, push = true) => {
    const node = find(root, p);
    if (!node || node.type !== "dir") return;
    if (push && p !== cwd) history.push(cwd);
    cwd = p;
    selected = null;
    draw();
    win.route = cwd;
    routeChanged(win);
  };
  // The router steers an open explorer: to a folder, optionally with a file selected.
  win.goTo = (p, selectPath) => {
    if (p !== cwd) go(p);
    win.route = cwd;
    const node = selectPath ? find(root, selectPath) : null;
    if (node) select(node);
  };
  back.addEventListener("click", () => history.length && go(history.pop(), false));
  up.addEventListener("click", () => cwd && go(parentOf(cwd)));

  const select = async (node) => {
    selected = node.path;
    for (const el of grid.children) el.classList.toggle("is-sel", el.dataset.path === node.path);
    pane.innerHTML = "";
    if (node.type === "dir") {
      pane.append(h("div", { class: "pane__meta" }, h("strong", {}, node.name), h("span", {}, `${node.children.length} item(s)`)));
      return;
    }
    pane.append(
      h(
        "div",
        { class: "pane__meta" },
        h("strong", {}, node.name),
        h("span", {}, `${(node.size / 1024).toFixed(node.size > 10240 ? 0 : 1)} KB`),
        h("button", { type: "button", class: "btn btn--sm", onclick: () => openFile(node), html: `<span>Open</span>` }),
      ),
      await viewerFor(node),
    );
  };

  const draw = () => {
    const node = find(root, cwd) || root;
    setTitle(win, cwd ? `${root.name} / ${cwd}` : root.name);
    back.disabled = !history.length;
    up.disabled = !cwd;
    crumbs.innerHTML = "";
    const parts = cwd ? cwd.split("/") : [];
    const segs = [["", root.name], ...parts.map((_, i) => [parts.slice(0, i + 1).join("/"), parts[i]])];
    segs.forEach(([p, label], i) => {
      if (i) crumbs.append(h("span", { class: "crumbs__sep", html: icon("chevron", 12) }));
      crumbs.append(h("button", { type: "button", class: "crumb", onclick: () => go(p) }, label));
    });

    grid.innerHTML = "";
    if (!node.children.length) grid.append(h("p", { class: "muted pad" }, "This folder is empty."));
    for (const c of node.children) {
      const tile = h(
        "button",
        {
          type: "button",
          class: "tile",
          role: "option",
          "data-path": c.path,
          onclick: () => select(c),
          ondblclick: () => (c.type === "dir" ? go(c.path) : openFile(c)),
          onkeydown: (e) => e.key === "Enter" && (c.type === "dir" ? go(c.path) : openFile(c)),
        },
        thumb(c),
        h("span", { class: "tile__name" }, c.name),
      );
      grid.append(tile);
    }
    pane.innerHTML = "";
    pane.append(h("p", { class: "muted pad" }, "Select a file to preview it."));
    drawSide();
  };

  const drawSide = () => {
    side.innerHTML = "";
    const branch = (node, depth) => {
      const open = cwd === node.path || cwd.startsWith(node.path ? node.path + "/" : "");
      const row = h(
        "button",
        {
          type: "button",
          class: `leaf${cwd === node.path ? " is-here" : ""}`,
          style: `padding-left:${8 + depth * 14}px`,
          onclick: () => (node.type === "dir" ? go(node.path) : (go(parentOf(node.path)), select(node))),
        },
        h("span", { class: "leaf__icon", html: icon(iconFor(node), 14) }),
        h("span", { class: "leaf__name" }, node.name),
      );
      side.append(row);
      if (node.type === "dir" && (open || depth === 0)) for (const c of node.children) branch(c, depth + 1);
    };
    branch(root, 0);
  };

  draw();
  return win;
}


function thumb(node) {
  const kind = iconFor(node);
  if (kind === "image") return h("span", { class: "tile__thumb" }, h("img", { src: raw(node.path, 240), alt: "", loading: "lazy" }));
  return h("span", { class: `tile__icon tile__icon--${kind}`, html: icon(kind, 34) });
}

/**
 * The image viewer in its own window: `items` ({ path, name, label? }) in order,
 * opened at `index`. One window per source (a page's images, a folder's images);
 * opening the same source again moves it to the asked image.
 */
export function openGallery(items, index, source) {
  const id = `gallery:${source}`;
  const existing = getWindow(id);
  if (existing) {
    existing.galleryGo?.(index);
    return openWindow({ id });
  }
  let win = null;
  const body = galleryView(items, index, (it) => {
    if (!win) return;
    setTitle(win, it.name);
    win.route = it.path;
    routeChanged(win);
  });
  win = openWindow({ id, title: items[index]?.name || "Images", iconName: "image", body, width: 960, height: 680, route: items[index]?.path || "" });
  win.items = items;
  win.galleryGo = (k) => {
    const thumb = body.querySelectorAll(".gallery__thumb")[k];
    if (thumb) thumb.click();
    body.focus();
  };
  body.start();
  return win;
}

/** An image file opens in the viewer with the other images of its folder beside it. */
function openImage(node) {
  // Back/Forward or a link to an image an open gallery already holds: step that gallery
  // (the top-most one) instead of opening the image's folder beside it.
  const holder = allWindows()
    .filter((w) => w.items?.some((it) => it.path === node.path))
    .sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
  if (holder) {
    holder.galleryGo(holder.items.findIndex((it) => it.path === node.path));
    return openWindow({ id: holder.id });
  }
  const folder = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
  const siblings = (find(storyRoot, folder)?.children || []).filter((c) => iconFor(c) === "image");
  const list = siblings.length ? siblings : [node];
  return openGallery(list.map((c) => ({ path: c.path, name: c.name })), Math.max(0, list.findIndex((c) => c.path === node.path)), `folder:${folder}`);
}

let storyRoot = null;
export const setStoryRoot = (tree) => (storyRoot = tree);

export async function openFile(node) {
  if (iconFor(node) === "image" && storyRoot) return openImage(node);
  // Already open (a link or Back landed on it): bring it forward, keep its edits.
  const existing = getWindow(`file:${node.path}`);
  if (existing) return openWindow({ id: existing.id });
  const body = await viewerFor(node);
  const win = openWindow({ id: `file:${node.path}`, title: node.path, iconName: iconFor(node), body, width: 820, height: 600, route: node.path });
  win.onClose = () => !(body.isDirty?.() && !confirmDiscard());
  return win;
}

// A native confirm is acceptable here: it only appears when closing a window
// with unsaved edits, the one case where losing work silently is worse.
function confirmDiscard() {
  return window.confirm("This file has unsaved changes. Close it anyway?");
}
