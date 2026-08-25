import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Cloud Run wants a self-contained server: standalone emits server.js plus
  // only the node_modules actually reached, which keeps the image small
  // enough to cold-start quickly.
  output: "standalone",
};

export default nextConfig;
