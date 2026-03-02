/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: [
        "@rootstock-kits/refuel-sdk",
        "@rootstock-kits/refuel-ui",
    ],
};

module.exports = nextConfig;
