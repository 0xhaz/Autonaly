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
  /** The headline numbers, rendered as a compact two-column table up front —
   *  a reader who opens the document and reads nothing else should still get
   *  the four figures that matter. */
  facts?: { label: string; value: string }[];
  sections: DocSection[];
  table?: DocTable;
  /** Beneficiaries: the other half of any disruption, and the half most
   *  reports omit. */
  winners?: DocTable;
  /** Definitions for every column the reader is about to meet. Always
   *  included: a ranking is not analysis if the figures are unexplained. */
  glossary?: DocTable;
  /** A PNG of the exposure map, already uploaded somewhere Google can fetch.
   *  Additive by contract — if it is missing or fails, the document is still
   *  complete. */
  imageUrl?: string;
  footer?: string;
}

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

interface TextBlock {
  text: string;
  style: "TITLE" | "SUBTITLE" | "HEADING_1" | "NORMAL_TEXT";
  italic?: boolean;
}

async function docEnd(token: string, documentId: string): Promise<number> {
  const doc = await docsApi(token, `/${documentId}`);
  const content = (doc.body as { content: { endIndex?: number }[] }).content;
  return Math.max(1, (content[content.length - 1]?.endIndex ?? 2) - 1);
}

/**
 * Append styled paragraphs at the end of the document.
 *
 * Everything is appended rather than positioned, because Docs is
 * index-addressed and every insert shifts what follows it. Building the
 * document strictly front-to-back means an index only has to be correct at the
 * moment it is used, and tables and images can be interleaved with prose
 * without recomputing anything.
 */
async function appendText(
  token: string,
  documentId: string,
  blocks: TextBlock[],
): Promise<void> {
  if (blocks.length === 0) return;
  const at = await docEnd(token, documentId);

  let text = "";
  const requests: object[] = [];
  const styled: { start: number; end: number; block: TextBlock }[] = [];
  for (const block of blocks) {
    const offset = text.length;
    text += `${block.text}\n`;
    styled.push({ start: offset, end: offset + block.text.length, block });
  }
  requests.push({ insertText: { location: { index: at }, text } });

  for (const { start, end, block } of styled) {
    const range = { startIndex: at + start, endIndex: at + end };
    requests.push({
      updateParagraphStyle: {
        range,
        paragraphStyle: { namedStyleType: block.style },
        fields: "namedStyleType",
      },
    });
    if (block.italic) {
      requests.push({
        updateTextStyle: { range, textStyle: { italic: true }, fields: "italic" },
      });
    }
  }
  await docsApi(token, `/${documentId}:batchUpdate`, { requests });
}

/**
 * Tables need two round trips: cell indices only exist once the table does and
 * cannot be predicted from the request. Cells fill back-to-front so earlier
 * insertions do not invalidate later indices.
 */
async function appendTable(
  token: string,
  documentId: string,
  table: DocTable,
): Promise<void> {
  const at = await docEnd(token, documentId);
  const rows = table.rows.length + 1;
  const columns = table.headers.length;
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [{ insertTable: { rows, columns, location: { index: at } } }],
  });

  const doc = await docsApi(token, `/${documentId}`);
  const content = (doc.body as { content: Record<string, unknown>[] }).content;
  const tables = content.filter((element) => "table" in element);
  const target = tables[tables.length - 1];
  if (!target) return;

  const tableRows = (target.table as { tableRows: Record<string, unknown>[] }).tableRows;
  const grid = [table.headers, ...table.rows];
  const fills: { index: number; text: string; header: boolean }[] = [];

  tableRows.forEach((row, rowIndex) => {
    const cells = (row as { tableCells: Record<string, unknown>[] }).tableCells;
    cells.forEach((cell, columnIndex) => {
      const cellContent = (cell as { content: Record<string, unknown>[] }).content;
      const paragraph = cellContent[0] as { startIndex: number };
      const value = grid[rowIndex]?.[columnIndex] ?? "";
      if (value) {
        fills.push({ index: paragraph.startIndex, text: value, header: rowIndex === 0 });
      }
    });
  });

  fills.sort((a, b) => b.index - a.index);
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: fills.map((fill) => ({
      insertText: { location: { index: fill.index }, text: fill.text },
    })),
  });

  const headers = fills.filter((f) => f.header);
  if (headers.length) {
    await docsApi(token, `/${documentId}:batchUpdate`, {
      requests: headers.map((cell) => ({
        updateTextStyle: {
          range: { startIndex: cell.index, endIndex: cell.index + cell.text.length },
          textStyle: { bold: true },
          fields: "bold",
        },
      })),
    });
  }
}

/** Google fetches the image itself, so the URL must be publicly reachable at
 *  insert time. Failure is swallowed by the caller: a document without its map
 *  is still a complete document. */
async function appendImage(token: string, documentId: string, uri: string): Promise<void> {
  const at = await docEnd(token, documentId);
  await docsApi(token, `/${documentId}:batchUpdate`, {
    requests: [
      {
        insertInlineImage: {
          location: { index: at },
          uri,
          objectSize: {
            width: { magnitude: 468, unit: "PT" },
            height: { magnitude: 260, unit: "PT" },
          },
        },
      },
    ],
  });
}

/** Creates the document and returns its URL. */
export async function exportToDocs(userId: string, spec: DocSpec): Promise<string> {
  const token = await accessToken(userId);
  if (!token) throw new Error("google account not connected");

  const created = await docsApi(token, "", { title: spec.title });
  const documentId = created.documentId as string;

  const head: TextBlock[] = [{ text: spec.title, style: "TITLE" }];
  if (spec.subtitle) head.push({ text: spec.subtitle, style: "SUBTITLE", italic: true });
  if (spec.facts?.length) head.push({ text: "Key figures", style: "HEADING_1" });
  await appendText(token, documentId, head);

  if (spec.facts?.length) {
    await appendTable(token, documentId, {
      headers: ["Measure", "Value"],
      rows: spec.facts.map((f) => [f.label, f.value]),
    });
  }

  const body: TextBlock[] = [];
  for (const section of spec.sections) {
    if (section.heading) body.push({ text: section.heading, style: "HEADING_1" });
    for (const paragraph of section.paragraphs) {
      if (paragraph.trim()) body.push({ text: paragraph, style: "NORMAL_TEXT" });
    }
  }
  await appendText(token, documentId, body);

  if (spec.imageUrl) {
    try {
      await appendText(token, documentId, [
        { text: "Exposure map", style: "HEADING_1" },
      ]);
      await appendImage(token, documentId, spec.imageUrl);
      await appendText(token, documentId, [
        {
          text: "Colour is dependency intensity; the outlined country carries the largest absolute exposure.",
          style: "NORMAL_TEXT",
          italic: true,
        },
      ]);
    } catch {
      // Additive by contract — never fail an export over its illustration.
    }
  }

  if (spec.table) {
    await appendText(token, documentId, [
      { text: spec.table.caption ?? "Ranked exposure", style: "HEADING_1" },
    ]);
    await appendTable(token, documentId, spec.table);
  }

  if (spec.winners?.rows.length) {
    await appendText(token, documentId, [
      { text: spec.winners.caption ?? "Who benefits", style: "HEADING_1" },
    ]);
    await appendTable(token, documentId, spec.winners);
  }

  if (spec.glossary?.rows.length) {
    await appendText(token, documentId, [
      { text: spec.glossary.caption ?? "How to read these figures", style: "HEADING_1" },
    ]);
    await appendTable(token, documentId, spec.glossary);
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
