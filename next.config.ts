import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(',').map((o) => o.trim())
    : [
        'work-1-jeuxkxyhhadkcukn.prod-runtime.all-hands.dev',
        'work-2-jeuxkxyhhadkcukn.prod-runtime.all-hands.dev',
      ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
