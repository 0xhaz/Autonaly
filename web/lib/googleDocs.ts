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

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
  table?: DocTable;
  footer?: string;
}

interface StyledRange {
  start: number;
  end: number;
  style: "TITLE" | "SUBTITLE" | "HEADING_1" | "NORMAL_TEXT";
  italic?: boolean;
  small?: boolean;
}

/**
 * Docs is index-addressed, and every insert shifts everything after it. So the
 * body is composed as one string with offsets recorded as it grows, inserted
 * in a single request, and only then styled by range — rather than a sequence
 * of inserts whose indices have to be recomputed after each one.
 */
function composeBody(spec: DocSpec): { text: string; ranges: StyledRange[] } {
  let text = "";
  const ranges: StyledRange[] = [];
  const push = (chunk: string, style: StyledRange["style"], extra: Partial<StyledRange> = {}) => {
    const start = text.length;
    text += `${chunk}\n`;
    ranges.push({ start, end: start + chunk.length, style, ...extra });
  };

  push(spec.title, "TITLE");
  if (spec.subtitle) push(spec.subtitle, "SUBTITLE", { italic: true });

  for (const section of spec.sections) {
    if (section.heading) push(section.heading, "HEADING_1");
    for (const paragraph of section.paragraphs) {
      if (paragraph.trim()) push(paragraph, "NORMAL_TEXT");
    }
  }
  if (spec.table?.caption) push(spec.table.caption, "HEADING_1");
  return { text, ranges };
}

const STYLE_REQUESTS = (ranges: StyledRange[]) =>
  ranges.flatMap((r) => {
    // +1: Docs bodies start at index 1, so string offsets shift by one.
    const range = { startIndex: r.start + 1, endIndex: r.end + 1 };
    const requests: object[] = [
      {
        updateParagraphStyle: {
          range,
          paragraphStyle: { namedStyleType: r.style },
          fields: "namedStyleType",
        },
      },
    ];
    if (r.italic || r.small) {
      requests.push({
        updateTextStyle: {
          range,
          textStyle: {
            ...(r.italic ? { italic: true } : {}),
            ...(r.small ? { fontSize: { magnitude: 9, unit: "PT" } } : {}),
          },
          fields: [r.italic && "italic", r.small && "fontSize"].filter(Boolean).join(","),
        },
      });
    }
    return requests;
  });

async function docsApi(
  token: string,
  path: string,
  body?: object,
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://docs.googleapis.com/v1/documents${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `docs api ${response.status}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

/** Creates the document and returns its URL. */
export async function exportToDocs(userId: string, spec: DocSpec): Promise<string> {
  const token = await accessToken(userId);
  if (!token) throw new Error("google account not connected");

  const created = await docsApi(token, "", { title: spec.title });
  const documentId = created.documentId as string;

  const { text, ranges } = composeBody(spec);
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [{ insertText: { location: { index: 1 }, text } }, ...STYLE_REQUESTS(ranges)],
  });

  if (spec.table) {
    await insertTable(token, documentId, spec.table, text.length + 1);
  }
  if (spec.footer) {
    await appendFooter(token, documentId, spec.footer);
  }
  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  await recordExport(userId, {
    title: spec.title,
    url,
    created_at: new Date().toISOString(),
  });
  return url;
}

/**
 * Tables need two round trips: cell indices only exist once the table does,
 * and they cannot be predicted from the request. So insert, read the document
 * back to find each cell, then fill from the last cell backwards — filling
 * forwards would invalidate every index after the first insertion.
 */
async function insertTable(
  token: string,
  documentId: string,
  table: DocTable,
  atIndex: number,
): Promise<void> {
  const rows = table.rows.length + 1;
  const columns = table.headers.length;
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [{ insertTable: { rows, columns, location: { index: atIndex - 1 } } }],
  });

  const doc = await docsApi(token, `/${documentId}`);
  const content = (doc.body as { content: Record<string, unknown>[] }).content;
  const tableElement = content.find((element) => "table" in element);
  if (!tableElement) return;

  const tableRows = (tableElement.table as { tableRows: Record<string, unknown>[] }).tableRows;
  const grid = [table.headers, ...table.rows];
  const fills: { index: number; text: string }[] = [];

  tableRows.forEach((row, rowIndex) => {
    const cells = (row as { tableCells: Record<string, unknown>[] }).tableCells;
    cells.forEach((cell, columnIndex) => {
      const cellContent = (cell as { content: Record<string, unknown>[] }).content;
      const paragraph = cellContent[0] as { startIndex: number };
      const value = grid[rowIndex]?.[columnIndex] ?? "";
      if (value) fills.push({ index: paragraph.startIndex, text: value });
    });
  });

  fills.sort((a, b) => b.index - a.index);
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: fills.map((fill) => ({
      insertText: { location: { index: fill.index }, text: fill.text },
    })),
  });

  // Header row in bold, once the text exists.
  const headerCells = fills.filter((_, i) => i >= fills.length - columns);
  if (headerCells.length) {
    await docsApi(token, `/${documentId}:batchUpdate`, {
      requests: headerCells.map((cell) => ({
        updateTextStyle: {
          range: { startIndex: cell.index, endIndex: cell.index + cell.text.length },
          textStyle: { bold: true },
          fields: "bold",
        },
      })),
    });
  }
}

async function appendFooter(token: string, documentId: string, footer: string): Promise<void> {
  const doc = await docsApi(token, `/${documentId}`);
  const content = (doc.body as { content: { endIndex?: number }[] }).content;
  const end = content[content.length - 1]?.endIndex ?? 1;
  const at = Math.max(1, end - 1);
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [
      { insertText: { location: { index: at }, text: `\n${footer}\n` } },
      {
        updateTextStyle: {
          range: { startIndex: at, endIndex: at + footer.length + 1 },
          textStyle: { italic: true, fontSize: { magnitude: 9, unit: "PT" } },
          fields: "italic,fontSize",
        },
      },
    ],
  });
}
