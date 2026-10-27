import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/**": ["./config/certs/**/*"],
  },
};
export default config;
