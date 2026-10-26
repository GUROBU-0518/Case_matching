import { z } from "zod";

const nullableText = z.string().trim().min(1).nullable();

export const projectSchema = z.object({
  projectName: nullableText,
  summary: nullableText,
  requiredSkills: z.array(z.string().trim().min(1)).nullable(),
  rate: nullableText,
  unitPriceMin: z.number().int().nonnegative().nullable().optional(),
  unitPriceMax: z.number().int().nonnegative().nullable().optional(),
  location: nullableText,
  workStyle: nullableText,
  startDate: nullableText,
  headcount: z.number().int().nonnegative().nullable(),
  process: nullableText,
  commercialRestrictions: nullableText,
  sourceText: nullableText
});

export const talentSchema = z.object({
  nameOrInitial: nullableText,
  technicalSkills: z.array(z.string().trim().min(1)).nullable(),
  desiredRate: nullableText,
  desiredPriceMin: z.number().int().nonnegative().nullable().optional(),
  desiredPriceMax: z.number().int().nonnegative().nullable().optional(),
  nearestStation: nullableText,
  desiredWorkStyle: nullableText,
  availableFrom: nullableText,
  availableProcess: z.array(z.string().trim().min(1)).nullable(),
  affiliation: z.literal("BP"),
  sourceText: nullableText
});

export type Project = z.infer<typeof projectSchema>;
export type Talent = z.infer<typeof talentSchema>;

export const internalMetadataSchema = z.object({
  id: z.string().min(1),
  sourceMessageId: z.string().min(1).nullable(),
  status: z.enum(["pending", "processed", "failed"]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export type InternalMetadata = z.infer<typeof internalMetadataSchema>;
