/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Browser-automation SDKs must not be bundled. Stagehand resolves its bundled
  // Chrome-extension assets at runtime with `new URL("../", import.meta.url)`,
  // which the bundler cannot statically resolve — and even if it could, these
  // packages ship native and binary assets that only work when required from
  // node_modules on the server.
  serverExternalPackages: [
    "@browserbasehq/stagehand",
    "@browserbasehq/stagehand-v4",
    "@onkernel/sdk",
  ],
}

export default nextConfig
