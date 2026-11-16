import "dotenv/config";
import Fastify from "fastify";
import secureSession from "@fastify/secure-session";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const app = Fastify({ logger: process.env.NODE_ENV !== "production", trustProxy: true, bodyLimit: 32_000 });
await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
const sessionKey = process.env.SESSION_KEY;
const encryptionKeyText = process.env.ENCRYPTION_KEY;
if (sessionKey && Buffer.from(sessionKey, "base64").length === 32) {
  await app.register(secureSession, { key: Buffer.from(sessionKey, "base64"), cookie: { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 14 } });
}
const dataDir = resolve(process.env.APP_DATA_DIR ?? "./data");
const storePath = join(dataDir, "accounts.json");
type Account = { id: string; provider: "imap" | "google"; email: string; label: string; encrypted: string; addedAt: string };
type Store = { accounts: Account[] };
const readStore = async (): Promise<Store> => { try { return JSON.parse(await readFile(storePath, "utf8")) as Store; } catch { return { accounts: [] }; } };
const writeStore = async (store: Store) => { await mkdir(dataDir, { recursive: true }); const temp = `${storePath}.tmp`; await writeFile(temp, JSON.stringify(store), { mode: 0o600 }); await rename(temp, storePath); };
const getEncryptionKey = () => { const key = Buffer.from(encryptionKeyText ?? "", "base64"); if (key.length !== 32) throw new Error("ENCRYPTION_KEY muss ein Base64-kodierter 32-Byte-Schlüssel sein."); return key; };
function encrypt(value: unknown) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64"); }
function decrypt<T>(value: string): T { const bytes = Buffer.from(value, "base64"); const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as T; }
const oauthConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
const oauth = (callback = "/api/auth/google/callback") => new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.APP_URL}${callback}`);
const allowedEmail = (process.env.ALLOWED_GOOGLE_EMAIL ?? "").trim().toLowerCase();
const authenticated = async (request: any, reply: any) => {
  if (!sessionKey || Buffer.from(sessionKey, "base64").length !== 32) return reply.code(503).send({ error: "Backend-Sitzung ist nicht konfiguriert. SESSION_KEY fehlt." });
  if (!request.session.get("user")) return reply.code(401).send({ error: "Bitte zuerst mit deinem Google-Konto anmelden." });
};
const hostSchema = z.string().min(3).max(253).refine((host) => !isIP(host) && !/[\s/@]/.test(host) && !host.endsWith("."), "Bitte einen öffentlichen Mailserver-Hostnamen eintragen.");
async function assertPublicHost(host: string) {
  if (["localhost", "localhost.localdomain"].includes(host.toLowerCase()) || host.toLowerCase().endsWith(".localhost") || host.toLowerCase().endsWith(".local")) throw new Error("Lokale Mailserver-Adressen sind aus Sicherheitsgründen nicht zugelassen.");
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => {
    if (family === 4) { const [a,b] = address.split(".").map(Number); return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
    const v6 = address.toLowerCase(); return !(v6.startsWith("2") || v6.startsWith("3")) || v6.startsWith("2001:db8:") || v6.startsWith("2001:10:");
  })) throw new Error("Der Mailserver muss auf eine öffentliche IP-Adresse zeigen.");
}
const imapSchema = z.object({ email: z.string().email().max(254), username: z.string().min(1).max(254), password: z.string().min(1).max(2048), imapHost: hostSchema, imapPort: z.coerce.number().int().min(1).max(65535), smtpHost: hostSchema, smtpPort: z.coerce.number().int().min(1).max(65535) });

app.get("/api/health", async () => ({ ok: true, googleOAuthConfigured: oauthConfigured(), sessionConfigured: Boolean(sessionKey && Buffer.from(sessionKey, "base64").length === 32), ownerConfigured: Boolean(allowedEmail) }));
app.get("/api/auth/google", async (request: any, reply) => {
  if (!sessionKey || Buffer.from(sessionKey, "base64").length !== 32) return reply.code(503).send({ error: "SESSION_KEY fehlt oder ist ungültig." });
  if (!allowedEmail) return reply.code(503).send({ error: "ALLOWED_GOOGLE_EMAIL muss gesetzt sein, damit nur dein Konto zugelassen wird." });
  if (!oauthConfigured()) return reply.code(503).send({ error: "Google-OAuth fehlt. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET und APP_URL konfigurieren." });
  const state = randomBytes(24).toString("hex"); request.session.set("loginState", state);
  return reply.redirect(oauth().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["openid", "email", "profile"], state }));
});
app.get("/api/auth/google/callback", async (request: any, reply) => {
  try {
    const query = request.query as { code?: string; state?: string; error?: string };
    const expected = request.session.get("loginState"); request.session.delete("loginState");
    if (!query.code || !query.state || !expected || query.state !== expected || query.error) return reply.code(400).type("text/plain").send("Google-Anmeldung abgebrochen oder ungültig.");
    const client = oauth(); const { tokens } = await client.getToken(query.code); client.setCredentials(tokens);
    const user = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    const email = user.data.email?.toLowerCase();
    if (!allowedEmail || !email || email !== allowedEmail) return reply.code(403).type("text/plain").send("Dieses Google-Konto ist für Smart Mail nicht freigeschaltet. ALLOWED_GOOGLE_EMAIL muss auf dem Server konfiguriert sein.");
    request.session.set("user", { email, name: user.data.name ?? email });
    return reply.redirect("/");
  } catch (error) { request.log.error(error); return reply.code(500).type("text/plain").send("Google-Anmeldung fehlgeschlagen."); }
});
app.get("/api/auth/me", async (request: any) => ({ user: request.session.get("user") ?? null }));
app.post("/api/auth/logout", { preHandler: authenticated }, async (request: any) => { request.session.delete(); return { ok: true }; });
app.get("/api/accounts", { preHandler: authenticated }, async () => ({ accounts: (await readStore()).accounts.map(({ id, provider, email, label, addedAt }) => ({ id, provider, email, label, addedAt })) }));
app.get("/api/accounts/google/connect", { preHandler: authenticated }, async (request: any, reply) => {
  if (!encryptionKeyText || Buffer.from(encryptionKeyText, "base64").length !== 32) return reply.code(503).send({ error: "ENCRYPTION_KEY fehlt oder ist ungültig." });
  if (!oauthConfigured()) return reply.code(503).send({ error: "Google-OAuth fehlt. Zuerst Client-ID, Client-Secret und APP_URL konfigurieren." });
  const state = randomBytes(24).toString("hex"); request.session.set("gmailState", state);
  return reply.redirect(oauth("/api/accounts/google/callback").generateAuthUrl({ access_type: "offline", prompt: "consent", include_granted_scopes: true, scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"], state }));
});
app.get("/api/accounts/google/callback", { preHandler: authenticated }, async (request: any, reply) => {
  try {
    getEncryptionKey();
    const query = request.query as { code?: string; state?: string; error?: string }; const expected = request.session.get("gmailState"); request.session.delete("gmailState");
    if (!query.code || !query.state || !expected || query.state !== expected || query.error) return reply.code(400).type("text/plain").send("Google-Mail-Verbindung abgebrochen oder ungültig.");
    const client = oauth("/api/accounts/google/callback"); const { tokens } = await client.getToken(query.code); client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: client }); const profile = await gmail.users.getProfile({ userId: "me" });
    const store = await readStore(); const account: Account = { id: `google-${profile.data.emailAddress}`, provider: "google", email: profile.data.emailAddress ?? "", label: "Google Mail", encrypted: encrypt(tokens), addedAt: new Date().toISOString() };
    store.accounts = [...store.accounts.filter((item) => item.id !== account.id), account]; await writeStore(store); return reply.redirect("/?connected=google");
  } catch (error) { request.log.error(error); return reply.code(500).type("text/plain").send("Google-Mail-Verbindung fehlgeschlagen."); }
});
app.post("/api/accounts/imap", { preHandler: authenticated }, async (request: any, reply) => {
  const parsed = imapSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Eingaben prüfen." });
  const input = parsed.data;
  let imap: ImapFlow | undefined; let smtp: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    getEncryptionKey();
    await Promise.all([assertPublicHost(input.imapHost), assertPublicHost(input.smtpHost)]);
    const imapSecure = input.imapPort === 993; const smtpSecure = input.smtpPort === 465;
    imap = new ImapFlow({ host: input.imapHost, port: input.imapPort, secure: imapSecure, doSTARTTLS: !imapSecure, auth: { user: input.username, pass: input.password }, logger: false, disableAutoIdle: true }); await imap.connect(); await imap.logout(); imap = undefined;
    smtp = nodemailer.createTransport({ host: input.smtpHost, port: input.smtpPort, secure: smtpSecure, requireTLS: !smtpSecure, auth: { user: input.username, pass: input.password }, tls: { rejectUnauthorized: true }, connectionTimeout: 12_000, greetingTimeout: 12_000, socketTimeout: 12_000 }); await smtp.verify();
    const store = await readStore(); const id = `imap-${randomBytes(8).toString("hex")}`; store.accounts.push({ id, provider: "imap", email: input.email.toLowerCase(), label: "IMAP / SMTP", encrypted: encrypt(input), addedAt: new Date().toISOString() }); await writeStore(store);
    return { ok: true, account: { id, provider: "imap", email: input.email.toLowerCase(), label: "IMAP / SMTP" } };
  } catch (error) { await imap?.logout().catch(() => {}); const message = error instanceof Error ? error.message : "Verbindung fehlgeschlagen."; request.log.warn({ err: error }, "Mail server check failed"); return reply.code(400).send({ error: `Verbindung konnte nicht geprüft werden: ${message.slice(0, 220)}` }); }
  finally { smtp?.close(); }
});
app.delete("/api/accounts/:id", { preHandler: authenticated }, async (request: any, reply) => { const id = (request.params as { id: string }).id; const store = await readStore(); const before = store.accounts.length; store.accounts = store.accounts.filter((item) => item.id !== id); if (before === store.accounts.length) return reply.code(404).send({ error: "Konto nicht gefunden." }); await writeStore(store); return { ok: true }; });

if (process.env.NODE_ENV === "production") {
  const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
  await app.register(fastifyStatic, { root, prefix: "/", wildcard: false });
  app.setNotFoundHandler((request, reply) => request.raw.url?.startsWith("/api/") ? reply.code(404).send({ error: "API-Route nicht gefunden." }) : reply.sendFile("index.html"));
}
const port = Number(process.env.PORT ?? 3000); await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
