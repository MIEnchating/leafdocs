# Implementation contract

Independent New API docs app. Root owns package/config, public UI/global CSS, local runtime and final integration. Backend agent owns prisma/, src/lib/server/, src/app/api/, .env.example. Editor agent owns src/components/admin/, src/app/admin/, src/app/login/ and admin.css. Do not edit another owner's files without coordination.

All JSON APIs return success payload directly; errors `{ error: string }` with meaningful HTTP status. Authenticated mutations require same-origin Origin. Root path `/` public home, `/docs/[slug]` public reader; `/admin` selects first doc, `/admin/[id]` editor; `/login` authentication.

Types in src/lib/types.ts are shared contract. API routes:

- POST /api/auth/login `{email,password}` => `{ok:true}` sets opaque server session cookie; POST /api/auth/logout => `{ok:true}` clears and revokes.
- GET /api/documents => DocumentSummary[]. POST same `{title?,parentId?}` => DocumentDetail.
- GET /api/documents/[id] => DocumentDetail.
- PATCH /api/documents/[id] `{version,title?,slug?,icon?,content?,parentId?,position?}` => DocumentDetail; atomically increments version. Stale version => 409. Parent must exist; reject self/cycles.
- DELETE /api/documents/[id] => `{ok:true}`; reject if has children. Publicly published doc deletion requires UI confirmation.
- POST /api/documents/[id]/publish `{version}` => DocumentDetail. Atomic version check and published snapshot (title, slug, icon, content); drafts never visible publicly.
- POST /api/documents/[id]/unpublish => DocumentDetail.
- GET /api/documents/[id]/revisions => RevisionSummary[]. POST /api/documents/[id]/restore `{revisionId,version}` => DocumentDetail (restores draft only).
- POST /api/uploads FormData `file` => `{url}`; authenticated, same-origin, 5MB maximum PNG/JPEG/WebP/GIF signature validated; GET /api/uploads/[filename] serves safe image bytes. Local upload directory `.data/uploads`.
- GET /api/search?q=... => `{id,title,slug,excerpt}[]` public, searches published title/plain content only, max 20.

Server exports in src/lib/server/documents.ts: `getPublishedDocuments(): Promise<PublishedDocument[]>`, `getPublishedDocument(slug): Promise<PublishedDocument|null>`.
Server exports in src/lib/server/auth.ts: `getSession(): Promise<{id:string,email:string}|null>`. Admin and login layouts can call directly.

Server stores versioned BlockNote JSON, published snapshots, sessions hashed in database, passwords scrypt. PostgreSQL only. Prisma 6.19.3. Seed creates initial admin from ADMIN_EMAIL and ADMIN_PASSWORD (no committed real credentials), and ~5 useful Chinese New API onboarding docs, published; seed idempotent. prisma migrate deploy must work, include migration SQL.

Frontend visual direction: polished quiet editorial documentation; warm white #faf9f6, sidebar #f5f4f0, dark olive text #292e29, sage accent #496953, amber #c79b54. Thin borders, serif display title using system Georgia/Noto Serif fallback, sans body; no stock gradients. Desktop left doc tree, central paper canvas, small right page-outline when space allows. Header Save state, Preview, Publish. Read view renders semantic HTML without loading full editor. Mobile usable navigation. Chinese interface. Use lucide-react icons.

Editor lazy loads BlockNote with ssr:false, Chinese locale, image upload via API. Debounced autosave ~800ms, serialized saves; preserve unsaved local edits on failure, no overwriting server version on conflict; flush save before preview/publish/switch docs; show status/errors. Draft preview in UI must never query public content. History restores draft then refresh editor. Ctrl/Cmd+S saves; Ctrl/Cmd+K public search. Editor callbacks use DocumentDetail.
