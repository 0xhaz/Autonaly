import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Google Docs export.
 *
 * Deliberately separate from Clerk sign-in: reconfiguring Clerk's Google
 * connection to carry extra scopes would touch the login path everyone uses,
 * to serve one optional feature. Instead the user connects Docs once, we keep
 * the refresh token, and sign-in is untouched.
 *
 * Scope is `drive.file` alone — per-file access to documents this app creates.
 * It cannot read anything else in the user's Drive, which is both the right
 * privacy posture and the easiest path through verification later.
 */

const PROJECT_ID = process.env.AUTONALY_PROJECT_ID ?? "autonaly-hackathon";
const COLLECTION = "google_tokens";
const EXPORTS = "google_exports";

export const DOCS_SCOPE = "https://www.googleapis.com/auth/drive.file";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";

export const docsConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

function db() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/**
 * The public origin, as the browser sees it.
 *
 * Cloud Run terminates TLS and proxies to the container, so Next's
 * `nextUrl.origin` reports the internal bind address — observed sending
 * `https://0.0.0.0:8080/api/google/callback` as the redirect_uri, which Google
 * rejects with `invalid_request`. The forwarded headers carry the real host.
 */
export function publicOrigin(request: {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string };
}): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || host.startsWith("0.0.0.0") || host.startsWith("127.0.0.1")) {
    return request.nextUrl.origin;
  }
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/api/google/callback`;
}

export function consentUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: DOCS_SCOPE,
    // offline + consent so a refresh token is actually issued; Google omits it
    // on repeat authorisations otherwise.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<{
  access_token?: string;
  refresh_token?: string;
  error?: string;
}> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...body,
    }),
  });
  return response.json();
}

export async function exchangeCode(
  userId: string,
  code: string,
  origin: string,
): Promise<boolean> {
  const tokens = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin),
  });
  if (!tokens.refresh_token) return false;
  await db().collection(COLLECTION).doc(userId).set({
    refresh_token: tokens.refresh_token,
    connected_at: new Date().toISOString(),
  });
  return true;
}

export async function isConnected(userId: string): Promise<boolean> {
  const snap = await db().collection(COLLECTION).doc(userId).get();
  return snap.exists && Boolean(snap.data()?.refresh_token);
}

export async function disconnect(userId: string): Promise<void> {
  await db().collection(COLLECTION).doc(userId).delete();
}

/** A short-lived access token, minted from the stored refresh token. */
async function accessToken(userId: string): Promise<string | null> {
  const snap = await db().collection(COLLECTION).doc(userId).get();
  const refresh = snap.data()?.refresh_token;
  if (!refresh) return null;
  const tokens = await tokenRequest({
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  return tokens.access_token ?? null;
}

export interface ExportedDoc {
  title: string;
  url: string;
  created_at: string;
}

/**
 * Remember what was exported.
 *
 * The document lands in the user's Drive, but a link they only ever saw on one
 * button is a link they have lost — Drive search is a poor substitute for "the
 * brief I exported on Tuesday". So each export is recorded and listed back.
 */
async function recordExport(userId: string, doc: ExportedDoc): Promise<void> {
  await db().collection(EXPORTS).add({ user_id: userId, ...doc });
}

export async function listExports(userId: string, limit = 8): Promise<ExportedDoc[]> {
  const snapshot = await db().collection(EXPORTS).where("user_id", "==", userId).get();
  return snapshot.docs
    .map((d) => d.data() as ExportedDoc)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

// --------------------------------------------------------------------------
// Document composition
// --------------------------------------------------------------------------

export interface DocSection {
  heading?: string;
  paragraphs: string[];
}

export interface DocTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

/**
 * A document is an ordered list of blocks.
 *
 * The previous shape had one optional field per section, which meant the
 * server decided the running order and a scenario with three disruption
 * channels had nowhere to put them. Blocks let the caller lay out a report of
 * any length while the server still owns the parts that must not be omitted —
 * the title, the glossary and the provenance footer.
 */
export type DocBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraphs"; text: string[]; italic?: boolean }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "image"; url: string; caption?: string };

export interface DocSpec {
  title: string;
  subtitle?: string;
  blocks: DocBlock[];
  /** Always appended, never caller-supplied: a ranking is not analysis if the
   *  figures are unexplained. */
  glossary?: DocTable;
  footer?: string;
}

interface StyleRun {
  start: number;
  end: number;
  style: "TITLE" | "SUBTITLE" | "HEADING_1" | "NORMAL_TEXT";
  italic?: boolean;
}

/**
 * Compose the whole document, then write it in a handful of calls.
 *
 * The first version appended block by block, reading the document back before
 * each one to find the end index. That is ~5 API calls per table and 2 per
 * paragraph — around forty round trips for a full conflict report, which
 * exhausted the Docs per-minute write quota and failed the export outright
 * (17s, then an instant rejection on retry as the quota stayed spent).
 *
 * Because all prose goes in as a single insertText at index 1, every character
 * offset is known in advance — so tables and images can be placed by
 * arithmetic rather than by reading the document back. Inserting them in
 * reverse index order means each insertion only shifts content after it, which
 * has already been placed. Five calls, whatever the report's length.
 */
async function docsApi(
  token: string,
  path: string,
  body?: object,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`https://docs.googleapis.com/v1/documents${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 429 && attempt < 3) {
      // Quota is per minute; a short wait is usually enough.
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const json = await response.json();
    if (!response.ok) {
      throw new Error(`docs api ${response.status}: ${JSON.stringify(json).slice(0, 400)}`);
    }
    return json;
  }
}

/** Creates the document and returns its URL. */
export async function exportToDocs(userId: string, spec: DocSpec): Promise<string> {
  const token = await accessToken(userId);
  if (!token) throw new Error("google account not connected");

  const created = await docsApi(token, "", { title: spec.title });
  const documentId = created.documentId as string;

  const blocks: DocBlock[] = [...spec.blocks];
  if (spec.glossary?.rows.length) {
    blocks.push(
      { kind: "heading", text: spec.glossary.caption ?? "How to read these figures" },
      { kind: "table", headers: spec.glossary.headers, rows: spec.glossary.rows },
    );
  }

  // --- compose the prose, recording where the structural elements belong ----
  let text = "";
  const runs: StyleRun[] = [];
  const tables: { offset: number; table: DocTable }[] = [];
  const images: { offset: number; url: string }[] = [];

  const push = (line: string, style: StyleRun["style"], italic = false) => {
    const at = text.length;
    text += `${line}\n`;
    runs.push({ start: at, end: at + line.length, style, italic });
  };

  push(spec.title, "TITLE");
  if (spec.subtitle) push(spec.subtitle, "SUBTITLE", true);

  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        push(block.text, "HEADING_1");
        break;
      case "paragraphs":
        for (const line of block.text) {
          if (line.trim()) push(line, "NORMAL_TEXT", block.italic);
        }
        break;
      case "table":
        if (block.rows.length) {
          tables.push({
            offset: text.length,
            table: { headers: block.headers, rows: block.rows },
          });
          // A blank line reserves the spot the table will occupy.
          text += "\n";
        }
        break;
      case "image":
        images.push({ offset: text.length, url: block.url });
        text += "\n";
        if (block.caption) push(block.caption, "NORMAL_TEXT", true);
        break;
    }
  }
  if (spec.footer) push(spec.footer, "NORMAL_TEXT", true);

  // --- call 1: all prose and all styling -----------------------------------
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [
      { insertText: { location: { index: 1 }, text } },
      ...runs.flatMap((r) => {
        const range = { startIndex: r.start + 1, endIndex: r.end + 1 };
        const reqs: object[] = [
          {
            updateParagraphStyle: {
              range,
              paragraphStyle: { namedStyleType: r.style },
              fields: "namedStyleType",
            },
          },
        ];
        if (r.italic) {
          reqs.push({
            updateTextStyle: { range, textStyle: { italic: true }, fields: "italic" },
          });
        }
        return reqs;
      }),
    ],
  });

  // --- call 2: tables and images, furthest first so indices stay valid ------
  const structural = [
    ...tables.map((t) => ({ offset: t.offset, kind: "table" as const, table: t.table })),
    ...images.map((i) => ({ offset: i.offset, kind: "image" as const, url: i.url })),
  ].sort((a, b) => b.offset - a.offset);

  if (structural.length) {
    await docsApi(token, `/${documentId}:batchUpdate`, {
      requests: structural.map((el) =>
        el.kind === "table"
          ? {
              insertTable: {
                rows: el.table.rows.length + 1,
                columns: el.table.headers.length,
                location: { index: el.offset + 1 },
              },
            }
          : {
              insertInlineImage: {
                location: { index: el.offset + 1 },
                uri: el.url,
                objectSize: {
                  width: { magnitude: 468, unit: "PT" },
                  height: { magnitude: 260, unit: "PT" },
                },
              },
            },
      ),
    });
  }

  // --- calls 3-5: fill every table cell in one pass -------------------------
  if (tables.length) {
    const doc = await docsApi(token, `/${documentId}`);
    const content = (doc.body as { content: Record<string, unknown>[] }).content;
    const found = content.filter((el) => "table" in el);
    // Document order matches composition order.
    const grids = tables.map((t) => [t.table.headers, ...t.table.rows]);

    const fills: { index: number; text: string; header: boolean }[] = [];
    found.forEach((element, tableIndex) => {
      const grid = grids[tableIndex];
      if (!grid) return;
      const rows = (element.table as { tableRows: Record<string, unknown>[] }).tableRows;
      rows.forEach((row, r) => {
        const cells = (row as { tableCells: Record<string, unknown>[] }).tableCells;
        cells.forEach((cell, c) => {
          const para = (cell as { content: { startIndex: number }[] }).content[0];
          const value = grid[r]?.[c] ?? "";
          if (value && para) {
            fills.push({ index: para.startIndex, text: value, header: r === 0 });
          }
        });
      });
    });

    // Descending, and each header is bolded in the same request stream directly
    // after its own insert. Every index here came from the read above, so it is
    // only valid until something is inserted at a lower index — and while
    // descending, nothing has been. Bolding in a later pass would use indices
    // that all the fills had since shifted, and bold arbitrary text mid-table.
    fills.sort((a, b) => b.index - a.index);
    if (fills.length) {
      await docsApi(token, `/${documentId}:batchUpdate`, {
        requests: fills.flatMap((f) => {
          const insert = {
            insertText: { location: { index: f.index }, text: f.text },
          };
          if (!f.header) return [insert];
          return [
            insert,
            {
              updateTextStyle: {
                range: { startIndex: f.index, endIndex: f.index + f.text.length },
                textStyle: { bold: true },
                fields: "bold",
              },
            },
          ];
        }),
      });
    }
  }

  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  await recordExport(userId, {
    title: spec.title,
    url,
    created_at: new Date().toISOString(),
  });
  return url;
}

