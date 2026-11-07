const path = require("path");

// Configuration for script generation
module.exports = {
  // App configuration
  app: {
    scheme: process.env.APP_SCHEME || "starter", // 앱별 딥링크 스킴
  },

  // Backend paths
  backend: {
    src: path.join(__dirname, "../backend/src"),
    prisma: {
      schema: path.join(__dirname, "../backend/prisma/schema.prisma"),
      client: path.join(__dirname, "../backend/node_modules/.prisma/client"),
    },
  },

  // 생성 대상별 클라이언트 경로와 런타임 adapter
  clients: {
    mobile: {
      fetch: path.join(__dirname, "../mobile/fetch"),
      mutation: path.join(__dirname, "../mobile/mutation"),
      query: path.join(__dirname, "../mobile/query"),
      types: path.join(__dirname, "../mobile/fetch/types"),
      authHookImport: "../zustand/auth",
      copyBackendUtils: true,
    },
    web: {
      fetch: path.join(__dirname, "../web/src/fetch"),
      mutation: path.join(__dirname, "../web/src/mutation"),
      query: path.join(__dirname, "../web/src/query"),
      types: path.join(__dirname, "../web/src/fetch/types"),
      authHookImport: "../zustand/auth",
    },
  },

  // 기존 스크립트 호환성을 위해 mobile alias를 유지합니다.
  get mobile() {
    return this.clients.mobile ?? this.clients.web;
  },

  getClientTarget(name = "mobile") {
    const target = this.clients[name];
    if (!target) {
      throw new Error(`지원하지 않는 클라이언트 대상입니다: ${name}`);
    }
    return target;
  },

  // Services to exclude from controller generation
  excludedServices: ["prisma.service.ts", "app.service.ts", "cron.service.ts"],

  // Directories to exclude from type generation
  excludedDirectories: [
    "prisma",
    "middleware",
    "email",
    "sms",
    "node_modules",
    "dist",
  ],

  // Auth configuration
  auth: {
    publicEndpoints: ["/auth/login", "/auth/register", "/auth/refresh"],
  },

  // Import configurations
  imports: {
    fetch: {
      constants: "./constants",
      utils: {
        next: "./utils/next",
        constants: "./utils/constants",
      },
    },
  },

  generation: {
    controllers: true,
  },

  // Get Prisma models dynamically
  async getPrismaModels() {
    try {
      const fs = require("fs");
      const schemaContent = fs.readFileSync(
        this.backend.prisma.schema,
        "utf-8",
      );

      // Extract model names from schema
      const modelRegex = /model\s+(\w+)\s*{/g;
      const models = [];
      let match;

      while ((match = modelRegex.exec(schemaContent)) !== null) {
        models.push(match[1]);
      }

      return models;
    } catch (error) {
      console.warn("Could not read Prisma schema, using empty model list");
      return [];
    }
  },

  // Get enum values dynamically
  async getEnums() {
    try {
      const fs = require("fs");
      const schemaContent = fs.readFileSync(
        this.backend.prisma.schema,
        "utf-8",
      );

      // Extract enum names and values from schema
      const enumRegex = /enum\s+(\w+)\s*{([^}]+)}/g;
      const enums = {};
      let match;

      while ((match = enumRegex.exec(schemaContent)) !== null) {
        const enumName = match[1];
        const enumValues = match[2]
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("//"))
          .map((value) => value.replace(/"/g, ""));

        enums[enumName] = enumValues;
      }

      return enums;
    } catch (error) {
      console.warn("Could not read Prisma enums, using empty object");
      return {};
    }
  },
};

module.exports.clients = Object.fromEntries(Object.entries(module.exports.clients).filter(([name]) => ["web"].includes(name)));
module.exports.app.scheme = process.env.APP_SCHEME || "orotaffiliate";
