# storyseam-preview

Open a [Storyseam](https://storyseam.app/spec) story folder as a desktop.

- **Folders as windows.** The story's top-level files and folders are desktop icons, drawn
  on a canvas drafting grid. Explorer windows have an address bar, a sidebar tree, an icon
  grid and a preview pane. Windows drag, resize, maximise and minimise to a taskbar.
- **Markdown, editable.** `storyseam.md`, the script, the outline: rendered, with YAML front
  matter shown as a token table. **Edit** flips to a text editor. **Save** or Cmd/Ctrl+S
  writes it back.
- **Config, visual.** `config.json`, `shotlist.json` and every other JSON file render as
  sections, chips and pills. A toggle switches to the raw **.json**, which you can edit; it
  only saves when it parses.
- **HTML previewer.** Shot previews (`shotlist/previews/<block>.html`) and the presets page
  open in a sandboxed frame, with their images and video resolved from the story.
- **Media.** Character sheets, plates, voice references and rendered clips.

```bash
npx -y github:bidah/storyseam-preview ./my-film
```

Or fork it:

```bash
git clone https://github.com/bidah/storyseam-preview.git && cd storyseam-preview
npm install
node bin/storyseam-preview.js ../my-film          # --port 4317, --no-open
```

## What it may touch

The server listens on `127.0.0.1` only and answers for the one folder you give it:

| Route | Does |
| --- | --- |
| `GET /__story/tree` | the folder as a tree (`.git` and `node_modules` skipped) |
| `GET /__story/file?path=` | a text file |
| `GET /__story/files/<path>` | any file's bytes, by path, so an HTML page's relative links resolve |
| `PUT /__story/file?path=` | save a `.md`, `.json` or `.txt` file. JSON must parse. Only from the previewer's own origin. |

Every path is resolved inside the story folder. Anything that escapes it is refused.

## Layout

`server/fs-api.js` is the Vite plugin that serves the folder. `src/wm.js` is the window
manager, `src/explorer.js` the explorer window, and `src/viewers.js` the markdown, JSON,
HTML and media viewers. `src/main.js` holds the desktop and the canvas grid. The app is
plain JavaScript, with no framework and one runtime dependency (`marked`), so there is
little to keep up to date.

It is described in the Storyseam spec, `docs/spec.md` §15. Nothing in a story depends on
it. MIT.
