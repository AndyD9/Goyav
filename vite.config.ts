import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const host = process.env.TAURI_DEV_HOST;
// Node 22+ ships its own global `localStorage`, which shadows happy-dom's
// and is undefined without `--localstorage-file`; disable it in test workers.
const nodeMajor = Number(process.versions.node.split(".")[0]);
// The release workflow stamps the real version (major.minor.<run number>)
// into tauri.conf.json before building, so read it from there: package.json
// keeps the base version and would show a stale number in About.
const tauriConf = JSON.parse(
  readFileSync(resolve(__dirname, "src-tauri/tauri.conf.json"), "utf-8"),
) as { version: string };

function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

export default defineConfig(async () => ({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    // Notes the release workflow generated for this build (Markdown).
    __APP_RELEASE_NOTES__: JSON.stringify(process.env.GOYAV_RELEASE_NOTES ?? ""),
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
