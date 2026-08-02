import { cpSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const LEGACY_SCRIPTS = [
  "data.js",
  "logic_func.js",
  "ui_shell.js",
  "interface.js",
  "animation.js",
  "main.js"
];

export default defineConfig({
  base: "./",
  plugins: [{
    name: "copy-legacy-browser-runtime",
    closeBundle() {
      const output = resolve("dist");
      cpSync(resolve("img"), resolve(output, "img"), { recursive: true });
      cpSync(resolve("js"), resolve(output, "js"), { recursive: true });
      for (const file of LEGACY_SCRIPTS) {
        copyFileSync(resolve(file), resolve(output, file));
      }
    }
  }]
});
