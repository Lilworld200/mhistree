import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
};
export default config;
