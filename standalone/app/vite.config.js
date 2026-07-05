import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
    plugins: [react()],
    server: {
        port: 1420,
        strictPort: true
    },
    build: {
        target: "es2022"
    }
});
//# sourceMappingURL=vite.config.js.map