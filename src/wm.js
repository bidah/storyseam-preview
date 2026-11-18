// A tiny window manager: draggable, resizable, focusable windows on the
// desktop, each with a taskbar button. Windows are plain DOM; the desktop's
// grid is drawn on a canvas behind them (main.js).
import { icon } from "./icons.js";

const desktop = () => document.getElementById("desktop");
const taskbar = () => document.getElementById("taskbar");
let z = 10;
let cascade = 0;
const windows = new Map();
let focusListener = null;
/** Called with the focused window (or null when none is left): the router keeps the URL on it. */
export const setFocusListener = (fn) => (focusListener = fn);
export const isOpen = (win) => Boolean(win && windows.has(win.id));
export const getWindow = (id) => windows.get(id) || null;
export const allWindows = () => [...windows.values()];

export function openWindow({ id, title, iconName = "file", body, width = 760, height = 520, route = "" }) {
  if (id && windows.has(id)) {
    const w = windows.get(id);
    w.el.hidden = false;
    focus(w);
    return w;
  }
  const el = document.createElement("section");
  el.className = "win";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", title);
  const vw = window.innerWidth;
  const vh = window.innerHeight - 44;
  const w = Math.min(width, vw - 24);
  const h = Math.min(height, vh - 24);
  const step = (cascade++ % 8) * 28;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${Math.max(8, Math.min(vw - w - 8, 140 + step))}px`;
  el.style.top = `${Math.max(8, Math.min(vh - h - 8, 40 + step))}px`;
  el.innerHTML = `
    <header class="win__bar">
      <span class="win__icon">${icon(iconName, 14)}</span>
      <span class="win__title"></span>
      <span class="win__btns">
        <button type="button" data-act="link" aria-label="Copy a link to this" title="Copy a link to this">${icon("link", 14)}</button>
        <button type="button" data-act="min" aria-label="Minimise">${icon("min", 14)}</button>
        <button type="button" data-act="max" aria-label="Maximise">${icon("max", 12)}</button>
        <button type="button" data-act="close" aria-label="Close">${icon("close", 14)}</button>
      </span>
    </header>
    <div class="win__body"></div>`;
  el.querySelector(".win__title").textContent = title;
  el.querySelector(".win__body").append(body);
  desktop().append(el);

  const tb = document.createElement("button");
  tb.type = "button";
  tb.className = "task";
  tb.innerHTML = `${icon(iconName, 14)}<span></span>`;
  tb.querySelector("span").textContent = title;
  taskbar().append(tb);

  const win = { id: id || `w${z}`, el, tb, onClose: null, route };
  windows.set(win.id, win);

  el.addEventListener("pointerdown", () => focus(win));
  tb.addEventListener("click", () => {
    if (el.hidden || !el.classList.contains("is-focused")) {
      el.hidden = false;
      focus(win);
    } else minimise(win);
  });
  el.querySelector(".win__btns").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (act === "close") close(win);
    if (act === "min") minimise(win);
    if (act === "link") copyLink(win, e.target.closest("button"));
    if (act === "max") el.classList.toggle("is-max");
  });
  el.querySelector(".win__bar").addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) el.classList.toggle("is-max");
  });
  drag(el, el.querySelector(".win__bar"));
  focus(win);
  return win;
}

export function setTitle(win, title) {
  win.el.querySelector(".win__title").textContent = title;
  win.tb.querySelector("span").textContent = title;
  win.el.setAttribute("aria-label", title);
}

export function close(win) {
  if (win.onClose && win.onClose() === false) return;
  win.el.remove();
  win.tb.remove();
  windows.delete(win.id);
  focusTop();
}

function minimise(win) {
  win.el.hidden = true;
  win.el.classList.remove("is-focused");
  win.tb.classList.remove("is-focused");
  focusTop();
}

/** Hand focus to the top-most visible window, or tell the router none is left. */
function focusTop() {
  const top = [...windows.values()].filter((w) => !w.el.hidden).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
  if (top) focus(top);
  else focusListener?.(null);
}

/** Re-announce a window's route after it changed (an explorer moved to another folder). */
export function routeChanged(win) {
  if (win.el.classList.contains("is-focused")) focusListener?.(win);
}

async function copyLink(win, button) {
  const url = location.origin + "/" + String(win.route || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  try {
    await navigator.clipboard.writeText(url);
    button.classList.add("is-done");
    setTimeout(() => button.classList.remove("is-done"), 1200);
  } catch {
    // Clipboard blocked (an insecure origin): the link is in the tooltip and the address bar.
    button.title = url;
    history.replaceState(null, "", url);
  }
}

function focus(win) {
  for (const w of windows.values()) {
    w.el.classList.remove("is-focused");
    w.tb.classList.remove("is-focused");
  }
  win.el.style.zIndex = String(++z);
  win.el.classList.add("is-focused");
  win.tb.classList.add("is-focused");
  focusListener?.(win);
}

function drag(el, handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button") || el.classList.contains("is-max")) return;
    const sx = e.clientX - el.offsetLeft;
    const sy = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const x = Math.max(-el.offsetWidth + 80, Math.min(window.innerWidth - 80, ev.clientX - sx));
      const y = Math.max(0, Math.min(window.innerHeight - 80, ev.clientY - sy));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
