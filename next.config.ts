import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com", // O asterisco (*) libera lh3, lh4, lh5...
      },
    ],
  },
};

export default nextConfig;