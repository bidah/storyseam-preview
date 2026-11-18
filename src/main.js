// The desktop: the story's top-level folders and files as icons on a drafting
// grid (drawn on a canvas), an explorer window open on the root, and a taskbar.
import "./style.css";
import { icon, iconFor } from "./icons.js";
import { h, setImageOpener, setReadOnly } from "./viewers.js";
import { openExplorer, openFile, openGallery, setStoryRoot } from "./explorer.js";
import { isOpen } from "./wm.js";
import { startRouter, urlFor } from "./router.js";

function drawGrid() {
  const c = document.getElementById("grid");
  const dpr = window.devicePixelRatio || 1;
  c.width = window.innerWidth * dpr;
  c.height = window.innerHeight * dpr;
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue("--desk").trim();
  g.fillRect(0, 0, window.innerWidth, window.innerHeight);
  const line = (step, color) => {
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0.5; x < window.innerWidth; x += step) (g.moveTo(x, 0), g.lineTo(x, window.innerHeight));
    for (let y = 0.5; y < window.innerHeight; y += step) (g.moveTo(0, y), g.lineTo(window.innerWidth, y));
    g.stroke();
  };
  line(24, css.getPropertyValue("--grid").trim());
  line(120, css.getPropertyValue("--grid-strong").trim());
}

async function boot() {
  drawGrid();
  addEventListener("resize", drawGrid);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawGrid);

  const desk = document.getElementById("desktop");
  let story;
  try {
    story = await (await fetch("/__story/tree")).json();
  } catch {
    desk.append(h("p", { class: "boot-err" }, "Could not read the story folder. Is the previewer server running?"));
    return;
  }
  document.title = `${story.tree.name} · Storyseam Preview`;
  setReadOnly(story.readOnly);
  setStoryRoot(story.tree);
  setImageOpener((items, index, source) => openGallery(items, index, `page:${source}`));

  const icons = h("div", { class: "desk-icons", role: "list" });
  const first = ["storyseam.md", "STORY.md", "config.json"];
  const items = [...story.tree.children].sort((a, b) => {
    const ia = first.indexOf(a.name);
    const ib = first.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  for (const node of items) {
    icons.append(
      h(
        "button",
        {
          type: "button",
          class: "desk-icon",
          role: "listitem",
          title: node.path,
          ondblclick: () => (node.type === "dir" ? openExplorer(story, node.path) : openFile(node)),
          onkeydown: (e) => e.key === "Enter" && (node.type === "dir" ? openExplorer(story, node.path) : openFile(node)),
          onauxclick: (e) => e.button === 1 && window.open(urlFor(node.path), "_blank"),
        },
        h("span", { class: `desk-icon__img tile__icon--${iconFor(node)}`, html: icon(iconFor(node), 34) }),
        h("span", { class: "desk-icon__name" }, node.name),
      ),
    );
  }
  desk.append(icons);

  // One main explorer the router steers; a folder link moves it rather than stacking windows.
  let main = null;
  const folder = (p, selectPath) => {
    if (isOpen(main)) {
      main.el.hidden = false;
      main.goTo(p, selectPath);
      main.el.dispatchEvent(new PointerEvent("pointerdown"));
    } else {
      main = openExplorer(story, p);
      if (selectPath) main.goTo(p, selectPath);
    }
    return main;
  };
  const notFound = (p) => {
    const note = h("p", { class: "toast", role: "status" }, `Nothing at /${p} in this story.`);
    document.body.append(note);
    setTimeout(() => note.remove(), 3500);
    history.replaceState(null, "", urlFor(""));
    folder("");
  };

  const start = h("button", { type: "button", class: "task task--start", onclick: () => folder(""), html: `${icon("explorer", 14)}<span>${story.tree.name}</span>` });
  document.getElementById("taskbar").prepend(start);

  const routed = await startRouter(story, { folder, file: openFile, notFound });
  if (!routed) {
    folder("");
    const spec = story.tree.children.find((c) => c.name === "storyseam.md");
    if (spec) await openFile(spec);
  }
}

boot();
