/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: [
        "@rootstock-kits/refuel-sdk",
        "@rootstock-kits/refuel-ui",
    ],
    experimental: {
        serverComponentsExternalPackages: ["@rsksmart/rif-relay-sdk", "web3"],
    },
    webpack: (config, { isServer }) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            electron: false,
        };
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                crypto: false,
                stream: false,
                http: false,
                https: false,
                zlib: false,
                path: false,
                os: false,
            };
        }
        return config;
    },
};

module.exports = nextConfig;
