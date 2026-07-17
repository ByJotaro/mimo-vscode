import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { resolve } from "path";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    outDir: "out",
    minify: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/webview/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") return "main.css";
          return assetInfo.name || "asset";
        },
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/webview"),
    },
  },
});
