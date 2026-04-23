/** @type {import('next').NextConfig} */
const path = require('path');

// Use empty string for local dev (NEXT_PUBLIC_BASE_PATH=""), otherwise default to production path
const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
  ? process.env.NEXT_PUBLIC_BASE_PATH
  : "/us/nc-stein-2027-tax-proposals";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  // Set the output file tracing root to this project's frontend directory
  // to avoid issues with lockfiles in parent directories
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
