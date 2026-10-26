import { z } from "zod";

const graphConfigSchema = z.object({
  tenantId: z.string().trim().min(1),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  mailboxes: z.array(z.string().email()).min(1),
});
export type GraphConfig = z.infer<typeof graphConfigSchema>;

export function parseGraphConfig(source: NodeJS.ProcessEnv = process.env): GraphConfig {
  const raw = (source.GRAPH_MAILBOXES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const mailboxes = [...new Set(raw)];
  return graphConfigSchema.parse({ tenantId: source.GRAPH_TENANT_ID, clientId: source.GRAPH_CLIENT_ID, clientSecret: source.GRAPH_CLIENT_SECRET, mailboxes });
}
