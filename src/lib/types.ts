export type DocumentSummary = {
  id: string;
  title: string;
  slug: string;
  icon: string;
  parentId: string | null;
  position: number;
  version: number;
  publishedVersion: number | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type DocumentDetail = DocumentSummary & {
  // BlockNote JSON, validated by the server before storage.
  content: unknown[];
};

export type RevisionSummary = {
  id: string;
  title: string;
  version: number;
  createdAt: string;
};

export type PublishedDocument = {
  id: string;
  title: string;
  slug: string;
  icon: string;
  parentId: string | null;
  position: number;
  content: unknown[];
  publishedAt: string;
};
