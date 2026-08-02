import { cpSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const LEGACY_SCRIPTS = [
  "data.js",
  "logic_func.js",
  "ui_shell.js",
  "motion.js",
  "interface.js",
  "animation.js",
  "main.js"
];

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0
  },
  plugins: [{
    name: "copy-legacy-browser-runtime",
    closeBundle() {
      const output = resolve("dist");
      cpSync(resolve("img"), resolve(output, "img"), { recursive: true });
      for (const file of LEGACY_SCRIPTS) {
        copyFileSync(resolve(file), resolve(output, file));
      }
    }
  }]
});
