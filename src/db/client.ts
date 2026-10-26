import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

const require = createRequire(import.meta.url);
const { PrismaClient: PrismaClientConstructor } = require("../../node_modules/.prisma/client/index.js") as typeof import("@prisma/client");

let client: PrismaClientType | undefined;

export function getPrismaClient(): PrismaClientType {
  client ??= new PrismaClientConstructor();
  return client;
}

export async function checkDatabaseConnection(): Promise<void> {
  await getPrismaClient().$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
