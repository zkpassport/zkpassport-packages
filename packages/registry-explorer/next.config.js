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

    return config
  },
}

module.exports = nextConfig
