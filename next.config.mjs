import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Home-directory package-lock.json was winning Turbopack root inference,
  // so app routes 404'd as HTML and client fetch().json() threw SyntaxError.
  turbopack: {
    root: __dirname,
  },
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
