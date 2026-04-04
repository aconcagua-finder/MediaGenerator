import type { NextConfig } from "next";
import crypto from "crypto";

const nextConfig: NextConfig = {
  output: "standalone",
  // Уникальный ID деплоя — клиент автоматически перезагрузится
  // при несовпадении с сервером после пересборки
  deploymentId: crypto.randomUUID(),
};

export default nextConfig;
