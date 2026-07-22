import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@pwrec/shared"],
  serverExternalPackages: ["better-sqlite3"],
}

export default nextConfig
