export default {
  testEnvironment: "node",
  transform: {
    "\\.[jt]sx?$": ["babel-jest", { configFile: "./babel.config.cjs" }],
  },
  transformIgnorePatterns: ["/node_modules/(?!(@zkpassport|@zk-kit|@noble)/.*)"],
  testMatch: ["<rootDir>/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.js"],
}
