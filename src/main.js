// The desktop: the story's top-level folders and files as icons on a drafting
// grid (drawn on a canvas), an explorer window open on the root, and a taskbar.
import "./style.css";
import { icon, iconFor } from "./icons.js";
import { h } from "./viewers.js";
import { openExplorer, openFile } from "./explorer.js";

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
        },
        h("span", { class: `desk-icon__img tile__icon--${iconFor(node)}`, html: icon(iconFor(node), 34) }),
        h("span", { class: "desk-icon__name" }, node.name),
      ),
    );
  }
  desk.append(icons);

  const start = h("button", { type: "button", class: "task task--start", onclick: () => openExplorer(story), html: `${icon("explorer", 14)}<span>${story.tree.name}</span>` });
  document.getElementById("taskbar").prepend(start);

  openExplorer(story);
  const spec = story.tree.children.find((c) => c.name === "storyseam.md");
  if (spec) openFile(spec);
}

boot();
