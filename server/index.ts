import "dotenv/config";
import Fastify from "fastify";
import secureSession from "@fastify/secure-session";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
type Account = { id: string; provider: "imap"; email: string; label: string; encrypted: string; addedAt: string };
type Store = { accounts: Account[] };
const readStore = async (): Promise<Store> => { try { return JSON.parse(await readFile(storePath, "utf8")) as Store; } catch { return { accounts: [] }; } };
const writeStore = async (store: Store) => { await mkdir(dataDir, { recursive: true }); const temp = `${storePath}.tmp`; await writeFile(temp, JSON.stringify(store), { mode: 0o600 }); await rename(temp, storePath); };
const getEncryptionKey = () => { const key = Buffer.from(encryptionKeyText ?? "", "base64"); if (key.length !== 32) throw new Error("ENCRYPTION_KEY muss ein Base64-kodierter 32-Byte-Schlüssel sein."); return key; };
function encrypt(value: unknown) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64"); }
function decrypt<T>(value: string): T { const bytes = Buffer.from(value, "base64"); const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as T; }
const appAccessPassword = process.env.APP_ACCESS_PASSWORD ?? "";
const accessConfigured = () => appAccessPassword.length >= 20;
const authenticated = async (request: any, reply: any) => {
  if (!sessionKey || Buffer.from(sessionKey, "base64").length !== 32) return reply.code(503).send({ error: "Backend-Sitzung ist nicht konfiguriert. SESSION_KEY fehlt." });
  if (!request.session.get("user")) return reply.code(401).send({ error: "Bitte zuerst bei Smart Mail anmelden." });
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

app.get("/api/health", async () => ({ ok: true, sessionConfigured: Boolean(sessionKey && Buffer.from(sessionKey, "base64").length === 32), accessConfigured: accessConfigured(), encryptionConfigured: Boolean(encryptionKeyText && Buffer.from(encryptionKeyText, "base64").length === 32) }));
app.post("/api/auth/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request: any, reply) => {
  if (!sessionKey || Buffer.from(sessionKey, "base64").length !== 32) return reply.code(503).send({ error: "SESSION_KEY fehlt oder ist ungültig." });
  if (!accessConfigured()) return reply.code(503).send({ error: "APP_ACCESS_PASSWORD muss als Server-Secret mindestens 20 Zeichen lang sein." });
  const parsed = z.object({ password: z.string().min(1).max(512) }).safeParse(request.body);
  if (!parsed.success || !timingSafeEqual(createHash("sha256").update(parsed.success ? parsed.data.password : "").digest(), createHash("sha256").update(appAccessPassword).digest())) return reply.code(401).send({ error: "Zugangsschlüssel ist nicht korrekt." });
  request.session.set("user", { email: "Smart Mail", name: "Smart Mail" }); return { ok: true };
});
app.get("/api/auth/me", async (request: any) => ({ user: request.session.get("user") ?? null }));
app.post("/api/auth/logout", { preHandler: authenticated }, async (request: any) => { request.session.delete(); return { ok: true }; });
app.get("/api/accounts", { preHandler: authenticated }, async () => ({ accounts: (await readStore()).accounts.map(({ id, provider, email, label, addedAt }) => ({ id, provider, email, label, addedAt })) }));
app.get("/api/accounts/:id/messages", { preHandler: authenticated }, async (request: any, reply) => {
  const { id } = request.params as { id: string }; const account = (await readStore()).accounts.find((item) => item.id === id);
  if (!account) return reply.code(404).send({ error: "E-Mail-Konto nicht gefunden." });
  let client: ImapFlow | undefined;
  try {
    const credentials = decrypt<z.infer<typeof imapSchema>>(account.encrypted);
    client = new ImapFlow({ host: credentials.imapHost, port: credentials.imapPort, secure: credentials.imapPort === 993, doSTARTTLS: credentials.imapPort !== 993, auth: { user: credentials.username, pass: credentials.password }, logger: false, disableAutoIdle: true });
    await client.connect(); const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    if (!mailbox.exists) return { messages: [] };
    const start = Math.max(1, mailbox.exists - 24); const messages: Array<Record<string, unknown>> = [];
    for await (const message of client.fetch(`${start}:*`, { uid: true, envelope: true, flags: true, internalDate: true, source: { maxLength: 200_000 } })) {
      if (!message.source) continue;
      const parsed = await simpleParser(message.source); const sender = parsed.from?.value[0]; const senderName = sender?.name || sender?.address || "Unbekannter Absender";
      const timestamp = parsed.date ?? (message.internalDate instanceof Date ? message.internalDate : new Date());
      let hue = 0; for (const char of senderName) hue = (hue * 31 + char.charCodeAt(0)) % 360;
      const recipients = parsed.to ? (Array.isArray(parsed.to) ? parsed.to.flatMap((item) => item.value) : parsed.to.value) : [];
      messages.push({ id: String(message.uid), sender: senderName, email: sender?.address ?? "", recipient: recipients.map((item) => item.address ?? item.name).filter(Boolean).join(", "), subject: parsed.subject ?? "(Kein Betreff)", preview: (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 180), body: (parsed.text ?? "Nachricht ohne Textinhalt.").slice(0, 20_000).split(/\n\s*\n/).filter(Boolean).slice(0, 30), time: timestamp.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }), color: `hsl(${hue} 58% 72%)`, initials: senderName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(), unread: !message.flags?.has("\\Seen"), starred: message.flags?.has("\\Flagged"), attachment: parsed.attachments[0]?.filename, folder: "inbox" });
    }
    return { messages: messages.reverse() };
  } catch (error) { const message = error instanceof Error ? error.message : "IMAP-Postfach konnte nicht geladen werden."; request.log.warn({ err: error }, "Inbox fetch failed"); return reply.code(502).send({ error: `Postfach konnte nicht geladen werden: ${message.slice(0, 180)}` }); }
  finally { await client?.logout().catch(() => {}); }
});
app.post("/api/accounts/:id/send", { preHandler: authenticated, config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request: any, reply) => {
  const { id } = request.params as { id: string }; const account = (await readStore()).accounts.find((item) => item.id === id);
  if (!account) return reply.code(404).send({ error: "E-Mail-Konto nicht gefunden." });
  const parsed = z.object({ to: z.string().email().max(254), subject: z.string().max(998), text: z.string().min(1).max(50_000) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Nachricht prüfen." });
  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const credentials = decrypt<z.infer<typeof imapSchema>>(account.encrypted); await assertPublicHost(credentials.smtpHost);
    transporter = nodemailer.createTransport({ host: credentials.smtpHost, port: credentials.smtpPort, secure: credentials.smtpPort === 465, requireTLS: credentials.smtpPort !== 465, auth: { user: credentials.username, pass: credentials.password }, tls: { rejectUnauthorized: true }, connectionTimeout: 12_000, greetingTimeout: 12_000, socketTimeout: 12_000 });
    const sent = await transporter.sendMail({ from: account.email, to: parsed.data.to, subject: parsed.data.subject, text: parsed.data.text });
    return { ok: true, messageId: sent.messageId };
  } catch (error) { const message = error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden."; request.log.warn({ err: error }, "SMTP send failed"); return reply.code(502).send({ error: `Versand fehlgeschlagen: ${message.slice(0, 180)}` }); }
  finally { transporter?.close(); }
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
    const store = await readStore(); const id = `imap-${randomBytes(8).toString("hex")}`; const label = /@(gmail|googlemail)\.com$/i.test(input.email) ? "Gmail via IMAP" : "IMAP / SMTP"; store.accounts.push({ id, provider: "imap", email: input.email.toLowerCase(), label, encrypted: encrypt(input), addedAt: new Date().toISOString() }); await writeStore(store);
    return { ok: true, account: { id, provider: "imap", email: input.email.toLowerCase(), label } };
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
