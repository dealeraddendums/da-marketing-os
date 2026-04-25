/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['dealeraddendums.com'] },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'dealeraddendums.com' },
      { protocol: 'https', hostname: 'www.dealeraddendums.com' },
      { protocol: 'https', hostname: 'littlefarmblogimages.s3.amazonaws.com' },
      { protocol: 'https', hostname: '*.hubspot.com' },
      { protocol: 'https', hostname: '*.hs-sites.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: 'https://dealeraddendums.com' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-API-Key' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
