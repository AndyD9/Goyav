import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { readFileSync } from "fs";

const host = process.env.TAURI_DEV_HOST;
// Node 22+ ships its own global `localStorage`, which shadows happy-dom's
// and is undefined without `--localstorage-file`; disable it in test workers.
const nodeMajor = Number(process.versions.node.split(".")[0]);
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig(async () => ({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    exclude: ["e2e-tests/**", "node_modules/**", ".claude/worktrees/**"],
    execArgv: nodeMajor >= 22 ? ["--no-experimental-webstorage"] : [],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || "localhost",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
