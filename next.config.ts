import type { NextConfig } from "next";

const stubModule = require.resolve("./lib/empty-module.js");

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    // Stub optional native modules pulled in by discord.js — not needed for Slack-only mode
    resolveAlias: {
      "zlib-sync": stubModule,
      "bufferutil": stubModule,
      "utf-8-validate": stubModule,
    },
  },
  webpack(config) {
    // Mirror turbopack stubs for webpack (used by Vercel production builds)
    config.resolve.alias = {
      ...config.resolve.alias,
      "zlib-sync": stubModule,
      "bufferutil": stubModule,
      "utf-8-validate": stubModule,
    };
    return config;
  },
};

export default nextConfig;
