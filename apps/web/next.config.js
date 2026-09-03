/** @type {import('next').NextConfig} */
const { execSync } = require("child_process");

function shortSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig = {
  reactStrictMode: true,
  env: {
    // Inlined at build time; shown in the footer build badge so we can tell
    // which commit / environment a running page came from.
    NEXT_PUBLIC_APP_VERSION: require("./package.json").version,
    NEXT_PUBLIC_APP_COMMIT: shortSha(),
    NEXT_PUBLIC_APP_ENV: process.env.VERCEL_ENV || "local",
    NEXT_PUBLIC_APP_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || "",
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
};

module.exports = nextConfig;
