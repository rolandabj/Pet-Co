import type { NextConfig } from "next";
import path from "path";

/**
 * Safely parse ALLOWED_DEV_ORIGINS from the environment.
 * Splits by comma, trims whitespace, and filters empty strings.
 * Falls back to an empty array if the variable is not set.
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/**',
      },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
