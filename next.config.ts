import type { NextConfig } from "next";
import crypto from "crypto";

const buildId = crypto.randomUUID();

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: () => buildId,
  deploymentId: buildId,
};

export default nextConfig;
