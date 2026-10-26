import { z } from "zod";

const nullableText = z.string().nullable();
const nullableTextList = z.array(z.string()).nullable();

export const aiProjectSchema = z.object({
  projectName: nullableText,
  summary: nullableText,
  price: nullableText,
  priceMin: z.number().int().nonnegative().nullable().optional(),
  priceMax: z.number().int().nonnegative().nullable().optional(),
  location: nullableText,
  nearestStation: nullableText,
  workStyle: nullableText,
  startDate: nullableText,
  requiredSkills: nullableTextList,
  preferredSkills: nullableTextList,
  headcount: nullableText,
  phase: nullableText,
  commercialFlowRestriction: nullableText,
});

export const aiTalentSchema = z.object({
  name: nullableText,
  desiredPrice: nullableText,
  desiredPriceMin: z.number().int().nonnegative().nullable().optional(),
  desiredPriceMax: z.number().int().nonnegative().nullable().optional(),
  nearestStation: nullableText,
  skills: nullableTextList,
  availableFrom: nullableText,
  availablePeriod: nullableText,
  age: nullableText,
  yearsOfExperience: nullableText,
  desiredWorkStyle: nullableText,
  availablePhases: nullableTextList,
  affiliationType: z.enum(["employee", "freelance", "unknown"]),
  notes: nullableText,
});

const baseAiResponseSchema = z.object({
  classification: z.enum(["project", "talent", "mixed", "other"]),
  projects: z.array(aiProjectSchema),
  talents: z.array(aiTalentSchema),
});

export const aiResponseSchema = baseAiResponseSchema.superRefine((value, context) => {
  const projects = value.projects.length;
  const talents = value.talents.length;
  const valid = value.classification === "project" ? projects > 0 && talents === 0
    : value.classification === "talent" ? projects === 0 && talents > 0
      : value.classification === "mixed" ? projects > 0 && talents > 0
        : projects === 0 && talents === 0;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "classificationとprojects/talentsの件数が一致しません" });
  value.projects.forEach((project, index) => { if (project.priceMin != null && project.priceMax != null && project.priceMin > project.priceMax) context.addIssue({ code: z.ZodIssueCode.custom, path: ["projects", index, "priceMin"], message: "最低単価が最高単価を超えています" }); });
  value.talents.forEach((talent, index) => { if (talent.desiredPriceMin != null && talent.desiredPriceMax != null && talent.desiredPriceMin > talent.desiredPriceMax) context.addIssue({ code: z.ZodIssueCode.custom, path: ["talents", index, "desiredPriceMin"], message: "最低希望単価が最高希望単価を超えています" }); });
});

export type AiProject = z.infer<typeof aiProjectSchema>;
export type AiTalent = z.infer<typeof aiTalentSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
