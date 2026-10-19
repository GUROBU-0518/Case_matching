import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { DeltaLinkStore } from "../mail/graph-delta.ts";

export class PrismaDeltaLinkStore implements DeltaLinkStore {
  private readonly prisma: PrismaClient;
  constructor(prisma: PrismaClient) { this.prisma = prisma; }
  async get(mailboxId: string): Promise<string | undefined> {
    const state = await this.prisma.mailSyncState.findUnique({ where: { mailboxId }, select: { deltaLink: true } });
    return state?.deltaLink;
  }
  async set(mailboxId: string, deltaLink: string): Promise<void> {
    await this.prisma.mailSyncState.upsert({
      where: { mailboxId },
      create: { id: randomUUID(), mailboxId, deltaLink, lastSyncedAt: new Date() },
      update: { deltaLink, lastSyncedAt: new Date() },
    });
  }
}
