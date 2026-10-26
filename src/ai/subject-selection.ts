export interface SubjectCandidate { subject: string | null; aiStatus?: string | null; }

export function selectExactSubjects<T extends SubjectCandidate>(candidates: T[], subjects: readonly string[]): T[] {
  const wanted = [...new Set(subjects.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) throw new Error("完全一致件名が指定されていません");
  const selected = candidates.filter((candidate) => candidate.subject !== null && wanted.includes(candidate.subject));
  for (const subject of wanted) {
    const count = selected.filter((candidate) => candidate.subject === subject).length;
    if (count > 1) throw new Error("同一件名のメールが複数存在するため安全に選択できません");
  }
  return selected;
}
