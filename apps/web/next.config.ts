import type { NextConfig } from "next";
const config: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination:
          (process.env.API_INTERNAL_URL || "http://127.0.0.1:8080") +
          "/v1/:path*",
      },
    ];
  },
};
export default config;
