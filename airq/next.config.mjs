/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled so the geolocation watch effect isn't double-invoked in dev
  // (StrictMode would trigger the browser permission prompt twice on mount).
  reactStrictMode: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.tile.openstreetmap.org" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
