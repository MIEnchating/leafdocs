export const MAX_TRANSFER_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSFER_DOCUMENTS = 200;

export type ArchiveDocument = {
  id: string;
  title: string;
  slug: string;
  icon: string;
  parentId: string | null;
  position: number;
  content: unknown[];
};

export type DocumentArchive = {
  format: "leafdocs";
  version: 1;
  exportedAt?: string;
  documents: ArchiveDocument[];
  assets: { url: string; data: string }[];
};

export type ImportResult = { count: number; firstId: string; renamed: number };
