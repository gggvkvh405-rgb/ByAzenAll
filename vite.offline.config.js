import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const favicon = readFileSync(new URL("./public/favicon.svg", import.meta.url)).toString("base64");

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    {
      name: "embed-offline-favicon",
      transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`),
      },
    },
    viteSingleFile(),
  ],
  build: {
    outDir: "release/offline",
    emptyOutDir: true,
    modulePreload: false,
  },
});
