export function indexDocumentTree<T extends { id: string; parentId: string | null; position: number }>(documents: T[]) {
  const ids = new Set(documents.map(document => document.id));
  const children = new Map<string | null, T[]>();
  for (const document of documents) {
    const parent = document.parentId && ids.has(document.parentId) ? document.parentId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(document);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
  return children;
}

export function descendantIds<T extends { id: string }>(children: Map<string | null, T[]>, id?: string) {
  const result = new Set<string>();
  const queue = id ? [id] : [];
  while (queue.length) {
    const current = queue.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const child of children.get(current) ?? []) queue.push(child.id);
  }
  return result;
}
