/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@zkpassport/sdk", "@zkpassport/ui"],
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      topLevelAwait: true,
    }
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    })
    return config
  },
}

module.exports = nextConfig
