import { defineConfig } from "vite";
import { storyFs } from "./server/fs-api.js";

// STORYSEAM_ROOT is set by bin/storyseam-preview.js; `npm run dev` inside this
// repo previews the current directory.
export default defineConfig({
  plugins: [storyFs(process.env.STORYSEAM_ROOT || process.cwd())],
  server: { host: "127.0.0.1", strictPort: false },
});
