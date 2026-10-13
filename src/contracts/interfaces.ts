import type { Project, Talent } from "../domain/schemas.js";

export type MailboxId = string;

export interface GraphMessage {
  readonly id: string;
  readonly mailboxId: MailboxId;
  readonly receivedDateTime: Date;
  readonly subject: string | null;
  readonly bodyHtml: string | null;
}

export interface GraphPage {
  readonly messages: readonly GraphMessage[];
  readonly nextLink: string | null;
  readonly deltaLink: string | null;
}

export interface GraphMailClient {
  listInitialMessages(mailboxId: MailboxId, since: Date): Promise<GraphPage>;
  listDelta(deltaLink: string): Promise<GraphPage>;
}

export type ExtractionResult =
  | { readonly kind: "project"; readonly data: Project }
  | { readonly kind: "talent"; readonly data: Talent };

export interface MessageClassifier {
  classifyAndExtract(sourceText: string): Promise<ExtractionResult>;
}

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
}

export interface TalentRepository {
  save(talent: Talent): Promise<void>;
  findById(id: string): Promise<Talent | null>;
}

export interface ProjectsApiResponse {
  readonly projects: readonly Project[];
}

export interface MatchesApiResponse {
  readonly talents: readonly Talent[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
