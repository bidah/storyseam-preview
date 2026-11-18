// What a file looks like when you open it:
//   markdown  rendered, with its front matter as a token table; Edit flips to a
//             textarea, Save (or Cmd/Ctrl+S) writes it back
//   json      a visual view (sections, chips, pills); a toggle flips it to the
//             raw JSON, which is editable and only saves when it parses
//   html      the HTML previewer: the page in a sandboxed frame, served from the
//             story so its relative media resolve (shot previews, camera.html)
//   media     images, video, audio from /__story/files
//   text      plain, read-only
import { marked } from "marked";
import { icon, iconFor } from "./icons.js";

// Set from /__story/tree: a shared preview shows everything and saves nothing.
let readOnly = false;
export const setReadOnly = (v) => (readOnly = Boolean(v));

export const raw = (p) => `/__story/files/${p.split("/").map(encodeURIComponent).join("/")}`;
const getText = async (p) => {
  const r = await fetch(`/__story/file?path=${encodeURIComponent(p)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.text();
};
const putText = async (p, text) => {
  const r = await fetch(`/__story/file?path=${encodeURIComponent(p)}`, { method: "PUT", body: text });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
};

function toolbar(...items) {
  return h("div", { class: "tools" }, ...items);
}
function btn(label, iconName, onclick, extra = {}) {
  return h("button", { type: "button", class: "btn", onclick, ...extra, html: `${icon(iconName, 14)}<span>${label}</span>` });
}
function status() {
  return h("span", { class: "status", role: "status" });
}
function flash(el, text, bad = false) {
  el.textContent = text;
  el.classList.toggle("is-bad", bad);
  clearTimeout(el._t);
  if (!bad) el._t = setTimeout(() => (el.textContent = ""), 2200);
}
function bindSave(root, save) {
  root.tabIndex = -1;
  root.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  });
}

// ---------- markdown ----------
function splitFrontMatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!m) return { fm: null, body: md };
  const fm = [];
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      fm.push([key, kv[2].replace(/^>-?\s*$/, "").replace(/\s+#.*$/, "")]);
    } else if (key && line.trim()) fm[fm.length - 1][1] += (fm[fm.length - 1][1] ? " " : "") + line.trim();
  }
  return { fm, body: md.slice(m[0].length) };
}

function markdownView(path, text) {
  const root = h("div", { class: "viewer" });
  const st = status();
  let mode = "view";
  let saved = text;
  const area = h("textarea", { class: "editor", spellcheck: "true", "aria-label": `Edit ${path}` });
  area.value = text;
  const out = h("article", { class: "md" });
  const editBtn = btn("Edit", "edit", () => setMode(mode === "view" ? "edit" : "view"));
  const saveBtn = btn("Save", "save", () => save(), { disabled: true });

  const render = () => {
    const { fm, body } = splitFrontMatter(area.value);
    out.innerHTML = "";
    if (fm?.length) {
      out.append(
        h("table", { class: "fm" }, h("tbody", {}, fm.map(([k, v]) => h("tr", {}, h("th", {}, k), h("td", {}, v))))),
      );
    }
    out.insertAdjacentHTML("beforeend", marked.parse(body));
  };
  const dirty = () => {
    const d = area.value !== saved;
    saveBtn.disabled = !d;
    root.classList.toggle("is-dirty", d);
  };
  const setMode = (m) => {
    mode = m;
    if (m === "view") render();
    area.hidden = m !== "edit";
    out.hidden = m === "edit";
    editBtn.innerHTML = `${icon(m === "edit" ? "eye" : "edit", 14)}<span>${m === "edit" ? "Preview" : "Edit"}</span>`;
    if (m === "edit") area.focus();
  };
  const save = async () => {
    if (area.value === saved) return;
    try {
      await putText(path, area.value);
      saved = area.value;
      dirty();
      flash(st, "Saved");
    } catch (e) {
      flash(st, e.message, true);
    }
  };
  area.addEventListener("input", dirty);
  bindSave(root, save);
  root.append(readOnly ? toolbar(h("span", { class: "muted" }, "Read-only")) : toolbar(editBtn, saveBtn, st), out, area);
  setMode("view");
  root.isDirty = () => area.value !== saved;
  return root;
}

// ---------- json / config ----------
function visual(value, key = null) {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== "object")) {
      return h("div", { class: "chips" }, value.length ? value.map((v) => h("span", { class: "chip" }, String(v))) : h("span", { class: "muted" }, "empty"));
    }
    return h("div", { class: "list" }, value.map((v, i) => h("div", { class: "item" }, h("span", { class: "idx" }, `#${i + 1}`), visual(v))));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return h("span", { class: "muted" }, "empty");
    return h(
      "dl",
      { class: key == null ? "obj obj--root" : "obj" },
      entries.map(([k, v]) => {
        const nested = v && typeof v === "object" && !(Array.isArray(v) && v.every((x) => x === null || typeof x !== "object"));
        return h("div", { class: nested ? "row row--nested" : "row" }, h("dt", {}, k), h("dd", {}, visual(v, k)));
      }),
    );
  }
  if (typeof value === "boolean") return h("span", { class: `pill ${value ? "pill--on" : "pill--off"}` }, value ? "true" : "false");
  if (typeof value === "number") return h("span", { class: "num" }, String(value));
  if (value === null) return h("span", { class: "muted" }, "null");
  const s = String(value);
  if (/^https?:\/\//.test(s)) return h("a", { href: s, target: "_blank", rel: "noopener noreferrer", class: "str" }, s);
  return h("span", { class: "str" }, s);
}

function jsonView(path, text) {
  const root = h("div", { class: "viewer" });
  const st = status();
  let saved = text;
  let mode = "visual";
  const area = h("textarea", { class: "editor editor--mono", spellcheck: "false", "aria-label": `Edit ${path}` });
  area.value = text;
  const out = h("div", { class: "visual" });
  const tabV = h("button", { type: "button", class: "seg is-on", onclick: () => setMode("visual") }, "Visual");
  const tabJ = h("button", { type: "button", class: "seg", onclick: () => setMode("json") }, ".json");
  const saveBtn = btn("Save", "save", () => save(), { disabled: true });

  const render = () => {
    out.innerHTML = "";
    try {
      out.append(visual(JSON.parse(area.value)));
    } catch (e) {
      out.append(h("p", { class: "err" }, `Not valid JSON: ${e.message}`));
    }
  };
  const setMode = (m) => {
    if (m === "visual") render();
    mode = m;
    area.hidden = m !== "json";
    out.hidden = m !== "visual";
    tabV.classList.toggle("is-on", m === "visual");
    tabJ.classList.toggle("is-on", m === "json");
  };
  const dirty = () => {
    const d = area.value !== saved;
    saveBtn.disabled = !d;
    root.classList.toggle("is-dirty", d);
  };
  const save = async () => {
    if (area.value === saved) return;
    try {
      JSON.parse(area.value);
    } catch (e) {
      return flash(st, `Not saved: ${e.message}`, true);
    }
    try {
      await putText(path, area.value);
      saved = area.value;
      dirty();
      flash(st, "Saved");
    } catch (e) {
      flash(st, e.message, true);
    }
  };
  area.addEventListener("input", dirty);
  bindSave(root, save);
  if (readOnly) area.readOnly = true;
  root.append(toolbar(h("div", { class: "segs", role: "group", "aria-label": "View as" }, tabV, tabJ), readOnly ? null : saveBtn, st), out, area);
  setMode(mode);
  root.isDirty = () => area.value !== saved;
  return root;
}

// ---------- html previewer ----------
function htmlView(node) {
  const frame = h("iframe", { class: "frame", src: raw(node.path), title: node.name, sandbox: "allow-same-origin allow-popups" });
  const reload = btn("Reload", "eye", () => (frame.src = `${raw(node.path)}?t=${Date.now()}`));
  const pop = h("a", { class: "btn", href: raw(node.path), target: "_blank", rel: "noopener", html: `${icon("explorer", 14)}<span>Open in a tab</span>` });
  return h("div", { class: "viewer" }, toolbar(reload, pop), frame);
}

// ---------- entry ----------
export async function viewerFor(node) {
  const kind = iconFor(node);
  if (kind === "image") return h("div", { class: "viewer viewer--media" }, h("img", { src: raw(node.path), alt: node.name }));
  if (kind === "video") return h("div", { class: "viewer viewer--media" }, h("video", { src: raw(node.path), controls: true }));
  if (kind === "audio") return h("div", { class: "viewer viewer--media" }, h("audio", { src: raw(node.path), controls: true }));
  if (kind === "html") return htmlView(node);
  let text;
  try {
    text = await getText(node.path);
  } catch (e) {
    return h("div", { class: "viewer" }, h("p", { class: "muted pad" }, `No preview: ${e.message}`));
  }
  if (kind === "markdown") return markdownView(node.path, text);
  if (kind === "json") return jsonView(node.path, text);
  return h("div", { class: "viewer" }, h("pre", { class: "plain" }, text));
}

export { h };
