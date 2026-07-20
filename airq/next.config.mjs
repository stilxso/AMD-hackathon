/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disabled so the geolocation watch effect isn't double-invoked in dev
  // (StrictMode would trigger the browser permission prompt twice on mount).
  reactStrictMode: false,
};

export default nextConfig;
