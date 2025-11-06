/* eslint-disable */
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
      "@zkpassport/utils": path.resolve(__dirname, "../zkpassport-utils/src"),
    }

    return config
  },
}

module.exports = nextConfig
