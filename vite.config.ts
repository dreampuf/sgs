import { cpSync, copyFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const IMAGE_ASSET_MODULE = "virtual:sgs-image-assets";
const RESOLVED_IMAGE_ASSET_MODULE = `\0${IMAGE_ASSET_MODULE}`;
const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function imageAssetPaths(
  directory = resolve("img"),
  relativeDirectory = "img"
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      return imageAssetPaths(resolve(directory, entry.name), relativePath);
    }
    const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
    return IMAGE_EXTENSIONS.has(extension) ? [relativePath] : [];
  }).sort();
}

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
  plugins: [
    {
      name: "sgs-image-asset-manifest",
      resolveId(id) {
        return id === IMAGE_ASSET_MODULE ? RESOLVED_IMAGE_ASSET_MODULE : null;
      },
      load(id) {
        if (id !== RESOLVED_IMAGE_ASSET_MODULE) return null;
        return `export default ${JSON.stringify(imageAssetPaths())};`;
      }
    },
    {
      name: "copy-legacy-browser-runtime",
      closeBundle() {
        const output = resolve("dist");
        cpSync(resolve("img"), resolve(output, "img"), { recursive: true });
        for (const file of LEGACY_SCRIPTS) {
          copyFileSync(resolve(file), resolve(output, file));
        }
      }
    }
  ]
});
