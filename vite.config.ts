import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath, URL } from "node:url";
import stylable from "./vite-plugins/stylable.ts";

export default defineConfig({
    base: process.env.BASE_PATH ?? "/",
    plugins: [preact(), stylable({ dtsDir: "./st-types" })],
    resolve: {
        alias: {
            "~": fileURLToPath(new URL("./src", import.meta.url)),
            react: "preact/compat",
            "react-dom": "preact/compat",
            "react-dom/test-utils": "preact/test-utils",
        },
    },
});
