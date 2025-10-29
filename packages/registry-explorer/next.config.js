const path = require("path")

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, {}) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    }

    // Add WASM file handling
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    })

    // Add alias resolution for @zkpassport/utils package
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/utils": path.resolve(__dirname, "../zkpassport-utils/src/utils"),
      "@/merkle-tree": path.resolve(__dirname, "../zkpassport-utils/src/merkle-tree"),
      "@/types": path.resolve(__dirname, "../zkpassport-utils/src/types"),
      "@/passport": path.resolve(__dirname, "../zkpassport-utils/src/passport"),
      "@/circuits": path.resolve(__dirname, "../zkpassport-utils/src/circuits"),
      "@/index": path.resolve(__dirname, "../zkpassport-utils/src/index"),
    }

    return config
  },
}

module.exports = nextConfig
