import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, Bell, ChevronDown, ChevronLeft, ChevronRight, FileText, Inbox, LayoutGrid, Mail, MailPlus, Menu, MoreHorizontal, PanelLeftClose, Search, Send, Settings, ShieldCheck, Sparkles, Star, Trash2, WandSparkles, X } from "lucide-react";
import type { MailMessage, MailFolder } from "./types";

type Page = "mail" | "general" | "appearance" | "accounts" | "ai" | "notifications";
const folders: { id: MailFolder; label: string; icon: typeof Inbox }[] = [{ id: "inbox", label: "Posteingang", icon: Inbox }];
const settingsPages: { id: Page; label: string; icon: typeof Settings; subtitle: string }[] = [
  { id: "general", label: "Allgemein", icon: Settings, subtitle: "Deine Smart Mail Erfahrung" },
  { id: "appearance", label: "Darstellung", icon: LayoutGrid, subtitle: "Passe das Erscheinungsbild an" },
  { id: "accounts", label: "Konten", icon: Mail, subtitle: "Verbundene E-Mail-Konten" },
  { id: "ai", label: "Smart AI", icon: Sparkles, subtitle: "Deine KI-Einstellungen" },
  { id: "notifications", label: "Benachrichtigungen", icon: Bell, subtitle: "Bleib auf dem Laufenden" },
];

export default function App() {
  const [page, setPage] = useState<Page>("accounts");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [activeAccount, setActiveAccount] = useState<{ id: string; email: string } | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "message">("list");
  const [aiOpen, setAiOpen] = useState(false);
  const [compose, setCompose] = useState(false);
  const [toggles, setToggles] = useState({ notifications: true, animations: true, blur: true, externalImages: false });
  const selected = messages.find((item) => item.id === selectedId) ?? null;
  const visibleMessages = useMemo(() => messages.filter((item) => {
    const inFolder = folder === "starred" ? item.starred : folder === "important" ? item.important : item.folder === folder;
    const search = `${item.sender} ${item.subject} ${item.preview}`.toLowerCase();
    return inFolder && (!unreadOnly || item.unread) && search.includes(query.toLowerCase());
  }), [folder, query, messages, unreadOnly]);
  const activeFolder = folders.find((item) => item.id === folder)?.label ?? "Posteingang";
  const flip = (key: keyof typeof toggles) => setToggles((current) => ({ ...current, [key]: !current[key] }));

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const healthResponse = await fetch("/api/health"); const health = await healthResponse.json();
        if (!healthResponse.ok || !health.sessionConfigured || !health.accessConfigured || !health.encryptionConfigured) throw new Error("Backend ist noch nicht eingerichtet.");
        const me = await fetch("/api/auth/me").then((response) => response.json()); if (!mounted) return;
        if (!me.user) { setPage("accounts"); return; }
        const result = await fetch("/api/accounts").then((response) => response.json()); const first = result.accounts?.[0];
        if (first) { setActiveAccount({ id: first.id, email: first.email }); setPage("mail"); } else setPage("accounts");
      } catch { if (mounted) setPage("accounts"); }
    };
    const connected = (event: Event) => { const account = (event as CustomEvent<{ id: string; email: string }>).detail; if (account) { setActiveAccount(account); setMessages([]); setPage("mail"); } };
    void loadSession(); window.addEventListener("smartmail:account-connected", connected);
    return () => { mounted = false; window.removeEventListener("smartmail:account-connected", connected); };
  }, []);
  useEffect(() => {
    if (!activeAccount) return;
    let mounted = true; setMailLoading(true); setMailError("");
    fetch(`/api/accounts/${encodeURIComponent(activeAccount.id)}/messages`).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Postfach konnte nicht geladen werden."); return result.messages as MailMessage[]; }).then((items) => { if (mounted) { setMessages(items); setSelectedId(items[0]?.id ?? ""); } }).catch((error) => { if (mounted) setMailError(error instanceof Error ? error.message : "Postfach konnte nicht geladen werden."); }).finally(() => { if (mounted) setMailLoading(false); });
    return () => { mounted = false; };
  }, [activeAccount]);

  return <main className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <header className="titlebar"><button className="mobile-menu-button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Navigation öffnen"><Menu size={18} /></button><div className="titlebar-brand"><img className="brand-glyph" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" /><span>Smart Mail</span><span className="titlebar-dot" /></div><div className="titlebar-center">Dein Postfach, in deinem Flow.</div></header>
    <div className={`workspace ${mobileView === "message" ? "mobile-message" : ""}`}>
      {mobileMenuOpen && <button className="mobile-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Navigation schließen" />}
      <aside className={`sidebar glass-panel ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top"><div className="account-switch"><div className="account-avatar">{activeAccount?.email.slice(0, 1).toUpperCase() ?? "S"}</div><div className="account-meta"><strong>{activeAccount?.email ?? "Noch kein Konto"}</strong><span>{activeAccount ? "Verbunden" : "Richte dein Postfach ein"}</span></div><ChevronDown size={15} className="muted" /></div><button className="icon-button collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Seitenleiste einklappen"><PanelLeftClose size={17} /></button></div>
        <button className="compose-button" onClick={() => setCompose(true)}><MailPlus size={17} /><span>Neue Nachricht</span><kbd>N</kbd></button>
        <div className="nav-label">POSTFACH</div><nav className="folder-nav">{folders.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === "mail" && folder === id ? "active" : ""}`} onClick={() => { setFolder(id); setPage("mail"); setMobileMenuOpen(false); setMobileView("list"); }}><Icon size={17} strokeWidth={1.75} /><span>{label}</span></button>)}</nav>
        <div className="sidebar-rule" /><div className="nav-label">KONTO</div><button className="nav-item folder-special" onClick={() => setPage("accounts")}><span className="folder-dot" /> <span>Konten verwalten</span></button>
        <div className="sidebar-spacer" /><div className="sidebar-bottom"><button className={`nav-item ${page !== "mail" ? "active" : ""}`} onClick={() => { setPage("general"); setMobileMenuOpen(false); }}><Settings size={17} /><span>Einstellungen</span></button><button className="nav-item" onClick={() => { setAiOpen(!aiOpen); setMobileMenuOpen(false); }}><Sparkles size={17} /><span>Smart AI</span><span className="beta-pill">BETA</span></button><div className="sidebar-footer"><div className="secure-dot"><ShieldCheck size={13} /></div><span>Deine Daten bleiben privat</span></div></div>
      </aside>

      {page === "mail" ? <>
        <section className="mail-list glass-panel">
          <div className="list-header"><div><div className="eyebrow">DEIN POSTFACH</div><h1>{activeFolder}</h1></div><button className="icon-button" aria-label="Weitere Optionen"><MoreHorizontal size={19} /></button></div>
          <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suchen …" /><kbd>⌘ K</kbd></label>
          <div className="list-tools"><button className={`filter-chip ${!unreadOnly ? "active" : ""}`} onClick={() => setUnreadOnly(false)}>Alle <span>{messages.length}</span></button><button className={`filter-chip ${unreadOnly ? "active" : ""}`} onClick={() => setUnreadOnly(true)}>Ungelesen <span>{messages.filter((item) => item.unread).length}</span></button></div>
          <div className="message-list">{visibleMessages.map((message) => <MessageRow key={message.id} message={message} active={message.id === selectedId} onClick={() => { setSelectedId(message.id); setMobileView("message"); }} />)}{mailLoading && <div className="empty-state">Posteingang wird geladen …</div>}{mailError && <div className="empty-state">{mailError}</div>}{!mailLoading && !mailError && visibleMessages.length === 0 && <div className="empty-state">Keine Nachrichten im Posteingang.</div>}</div>
          <div className="list-footer"><span>{visibleMessages.length} Nachrichten geladen</span><button aria-label="Posteingang neu laden" onClick={() => activeAccount && setActiveAccount({ ...activeAccount })}><ChevronRight size={16} /></button></div>
        </section>
        <section className="reading-pane glass-panel"><div className="message-toolbar"><div className="toolbar-group"><button className="icon-button mobile-back" aria-label="Zur Nachrichtenliste" onClick={() => setMobileView("list")}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="Archivieren"><Archive size={17} /></button><button className="icon-button" aria-label="Löschen"><Trash2 size={17} /></button><span className="toolbar-divider" /><button className="icon-button" aria-label="Als ungelesen markieren"><Mail size={17} /></button></div><div className="toolbar-group"><button className="icon-button" aria-label="Weitere Optionen"><MoreHorizontal size={18} /></button></div></div>
          {selected ? <div className="message-content"><div className="message-kicker"><span className="live-mark"><span /> LIVE-POSTFACH</span><span className="message-date">{selected.time}</span></div><h2 className="message-subject">{selected.subject}</h2>
            <div className="sender-card"><div className="sender-avatar" style={{ background: selected.color }}>{selected.initials}</div><div className="sender-details"><strong>{selected.sender}</strong><span>{selected.email}</span></div><button className="icon-button sender-more" aria-label="Absenderoptionen"><MoreHorizontal size={18} /></button></div>
            <div className="recipient-line">An <strong>{selected.recipient || activeAccount?.email}</strong> <ChevronDown size={13} /></div>
            <div className="mail-body">{selected.body.map((paragraph, index) => <p key={index}>{paragraph.split("\n").map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < paragraph.split("\n").length - 1 && <br />}</span>)}</p>)}</div>
            {selected.attachment && <div className="attachment-card"><div className="attachment-icon"><FileText size={19} /></div><div><strong>{selected.attachment}</strong><span>E-Mail-Anhang</span></div></div>}
            <div className="reply-actions"><button className="reply-button" onClick={() => setCompose(true)}><ChevronLeft size={15} className="reply-turn" /> Antworten</button><button className="forward-button" onClick={() => setCompose(true)}>Weiterleiten <ChevronRight size={15} /></button><button className="ai-suggest" onClick={() => setAiOpen(true)}><Sparkles size={15} /> Antwort vorschlagen</button></div>
          </div> : <div className="empty-reader">{mailLoading ? "Nachrichten werden geladen …" : "Wähle eine E-Mail aus, um sie zu lesen."}</div>}
          <div className="reading-bottom"><span><ShieldCheck size={14} /> Geschützte Nachrichtenvorschau</span><button onClick={() => flip("externalImages")}>{toggles.externalImages ? "Externe Bilder geladen" : "Externe Bilder blockiert"}</button></div>
        </section>
      </> : <SettingsPage page={page} setPage={setPage} toggles={toggles} flip={flip} />}
      <AnimatePresence>{aiOpen && <motion.aside className="ai-panel glass-panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}><div className="ai-head"><div className="ai-heading"><div className="ai-icon"><Sparkles size={17} /></div><div><strong>Smart AI</strong><span>Dein Schreibassistent</span></div></div><button className="icon-button" onClick={() => setAiOpen(false)} aria-label="Smart AI schließen"><X size={17} /></button></div><div className="ai-context"><span className="context-dot" /> Kontext aktiv <span>·</span> 1 Nachricht</div><div className="ai-welcome"><div className="ai-orb"><WandSparkles size={23} /></div><h3>Wie kann ich helfen?</h3><p>Ich habe den Kontext dieser Nachricht. Was möchtest du tun?</p></div><div className="ai-prompts"><button onClick={() => {}}>✦ &nbsp;Fasse diese E-Mail zusammen</button><button>↗ &nbsp;Schreibe eine freundliche Antwort</button><button>☷ &nbsp;Erkenne Aufgaben und Termine</button></div><div className="ai-chat-input"><input placeholder="Frag etwas zur E-Mail …" /><button aria-label="Senden"><Send size={16} /></button></div><div className="ai-privacy"><ShieldCheck size={13} /> Inhalte werden nur mit deiner Zustimmung geteilt.</div></motion.aside>}</AnimatePresence>
    </div>
    {compose && activeAccount && <ComposeModal onClose={() => setCompose(false)} onSend={async (to, subject, text) => { const response = await fetch(`/api/accounts/${encodeURIComponent(activeAccount.id)}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, subject, text }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Versand fehlgeschlagen."); setCompose(false); setActiveAccount({ ...activeAccount }); }} />}
  </main>;
}

function MessageRow({ message, active, onClick }: { message: MailMessage; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`message-row ${active ? "selected" : ""} ${message.unread ? "unread" : ""}`}><div className="row-top"><span className="row-sender">{message.sender}</span><span className="row-time">{message.time}</span></div><div className="row-subject">{message.subject}</div><div className="row-preview">{message.preview}</div><div className="row-meta">{message.attachment && <span className="attachment-tag"><FileText size={12} /> Anhang</span>}{message.important && <span className="important-tag">Wichtig</span>}{message.starred && <Star size={13} className="star-icon" fill="currentColor" />}</div>{message.unread && <span className="row-unread-dot" />}</button>;
}

function SettingsPage({ page, setPage, toggles, flip }: { page: Page; setPage: (page: Page) => void; toggles: { notifications: boolean; animations: boolean; blur: boolean; externalImages: boolean }; flip: (key: keyof typeof toggles) => void }) {
  const current = settingsPages.find((item) => item.id === page) ?? settingsPages[0];
  return <section className="settings-pane glass-panel"><div className="settings-top"><div><div className="eyebrow">SMART MAIL</div><h1>Einstellungen</h1><p>Gestalte deinen Arbeitsplatz nach deinen Wünschen.</p></div></div><div className="settings-layout"><nav className="settings-nav">{settingsPages.map(({ id, label, icon: Icon }) => <button className={page === id ? "active" : ""} key={id} onClick={() => setPage(id)}><Icon size={16} />{label}</button>)}</nav><div className="settings-content"><div className="settings-section-head"><div className="settings-page-icon"><current.icon size={19} /></div><div><h2>{current.label}</h2><p>{current.subtitle}</p></div></div>
    {page === "general" && <><div className="setting-group"><h3>Beim Start</h3><SettingSelect label="Startansicht" detail="Was du beim Öffnen von Smart Mail siehst" value="Posteingang" /><SettingToggle label="Zuletzt geöffnete Ansicht wiederherstellen" detail="Dort weitermachen, wo du aufgehört hast" checked={true} /></div><div className="setting-group"><h3>Bedienung</h3><SettingToggle label="Sanfte Animationen" detail="Flüssige Übergänge in der Oberfläche" checked={toggles.animations} onClick={() => flip("animations")} /><SettingToggle label="Bestätigung beim Löschen" detail="Vor dem endgültigen Entfernen nachfragen" checked={true} /></div></>}
    {page === "appearance" && <><div className="setting-group"><h3>Farbschema</h3><div className="theme-options"><button className="theme-choice selected"><span className="theme-swatch dark-swatch" /> Dunkel <span className="checkmark">✓</span></button><button className="theme-choice"><span className="theme-swatch light-swatch" /> Hell</button><button className="theme-choice"><span className="theme-swatch system-swatch" /> System</button></div><SettingSelect label="Akzentfarbe" detail="Farbe für Hervorhebungen und Aktionen" value="Soft Violet" /></div><div className="setting-group"><h3>Oberfläche</h3><SettingToggle label="Glasunschärfe" detail="Sanfte Tiefenwirkung für Oberflächen" checked={toggles.blur} onClick={() => flip("blur")} /><SettingSelect label="Listendichte" detail="Abstand zwischen Nachrichten" value="Kompakt" /></div></>}
    {page === "accounts" && <AccountSettings />}
    {page === "ai" && <><div className="setting-group"><h3>Anbieter</h3><div className="provider-choice"><div className="provider-mark">✳</div><div><strong>OpenAI</strong><span>Antworten, zusammenfassen und mehr</span></div><span className="coming-pill">BALD VERFÜGBAR</span></div><div className="provider-choice"><div className="provider-mark ollama">◉</div><div><strong>Ollama</strong><span>Lokale KI auf deinem Gerät</span></div><span className="coming-pill">BALD VERFÜGBAR</span></div></div><div className="setting-group"><h3>Datenschutz</h3><SettingToggle label="Kontext aus E-Mails verwenden" detail="Nachrichten erst nach deiner Bestätigung teilen" checked={true} /><div className="info-note"><ShieldCheck size={15} /> Deine E-Mails werden niemals automatisch an einen KI-Anbieter gesendet.</div></div></>}
    {page === "notifications" && <><div className="setting-group"><h3>Neue Nachrichten</h3><SettingToggle label="Desktop-Benachrichtigungen" detail="Bei neuen E-Mails eine Mitteilung zeigen" checked={toggles.notifications} onClick={() => flip("notifications")} /><SettingToggle label="Nur wichtige Nachrichten" detail="Benachrichtigungen auf markierte Nachrichten begrenzen" checked={false} /></div><div className="setting-group"><h3>Ruhezeiten</h3><SettingSelect label="Nicht stören" detail="Benachrichtigungen in einem Zeitraum pausieren" value="Aus" /></div></>}
    <div className="settings-save"><span><ShieldCheck size={14} /> Änderungen werden lokal gespeichert</span><button>Zurücksetzen</button></div></div></div></section>;
}
function SettingToggle({ label, detail, checked, onClick }: { label: string; detail: string; checked: boolean; onClick?: () => void }) { return <div className="setting-row"><div><strong>{label}</strong><span>{detail}</span></div><button className={`toggle ${checked ? "on" : ""}`} onClick={onClick} role="switch" aria-checked={checked}><span /></button></div>; }
function SettingSelect({ label, detail, value }: { label: string; detail: string; value: string }) { return <div className="setting-row"><div><strong>{label}</strong><span>{detail}</span></div><button className="select-box">{value}<ChevronDown size={14} /></button></div>; }
type ConnectedAccount = { id: string; provider: "imap"; email: string; label: string };
function AccountSettings() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]); const [user, setUser] = useState<{ email: string } | null>(null);
  const [health, setHealth] = useState<{ accessConfigured?: boolean; sessionConfigured?: boolean; encryptionConfigured?: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [form, setForm] = useState({ email: "", username: "", password: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465" });
  const refresh = async () => { try { const [h, me] = await Promise.all([fetch("/api/health").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json())]); setHealth(h); setUser(me.user); if (me.user) { const data = await fetch("/api/accounts").then((r) => r.json()); setAccounts(data.accounts ?? []); if (!data.accounts?.length) setShowForm(true); } } catch { setHealth(null); } };
  useEffect(() => { void refresh(); }, []);
  const login = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setNotice(""); try { const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: accessPassword }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Anmeldung fehlgeschlagen."); setAccessPassword(""); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen."); } finally { setBusy(false); } };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setAccounts([]); setNotice("Abgemeldet."); };
  const addImap = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setNotice(""); try { const response = await fetch("/api/accounts/imap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, imapPort: Number(form.imapPort), smtpPort: Number(form.smtpPort) }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Konto konnte nicht hinzugefügt werden."); setNotice(`${result.account.email} wurde verbunden.`); window.dispatchEvent(new CustomEvent("smartmail:account-connected", { detail: result.account })); setForm({ email: "", username: "", password: "", imapHost: "", imapPort: "993", smtpHost: "", smtpPort: "465" }); setShowForm(false); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "Verbindung fehlgeschlagen."); } finally { setBusy(false); } };
  const remove = async (account: ConnectedAccount) => { if (!window.confirm(`${account.email} wirklich entfernen?`)) return; const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" }); if (response.ok) { setAccounts((items) => items.filter((item) => item.id !== account.id)); setNotice("Konto entfernt."); } };
  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => <label className="connection-field"><span>{label}</span><input required type={type} placeholder={placeholder} value={String(form[key])} onChange={(event) => setForm((current) => ({ ...current, [key]: type === "checkbox" ? event.target.checked : event.target.value }))} /></label>;
  return <div className="setting-group"><h3>Deine Konten</h3>
    {!user ? health?.sessionConfigured && health.accessConfigured ? <form className="connection-card" onSubmit={login}><strong>Smart Mail entsperren</strong><span>Gib deinen persönlichen Smart-Mail-Zugangsschlüssel ein.</span><label className="connection-field"><span>Zugangsschlüssel</span><input autoComplete="current-password" type="password" required value={accessPassword} onChange={(event) => setAccessPassword(event.target.value)} /></label><button className="connection-submit" disabled={busy}>{busy ? "Anmeldung …" : "Entsperren"}</button></form> : <div className="connection-card"><strong>Backend noch nicht bereit</strong><span>Die öffentliche GitHub-Pages-Seite liefert nur die Oberfläche. Das Backend benötigt einen Smart-Mail-Zugangsschlüssel und sichere Server-Schlüssel.</span></div> : <>
      <div className="connection-card signed-in"><strong>Angemeldet bei Smart Mail</strong><span>Konten und Zugangsdaten sind serverseitig geschützt.</span><button className="subtle-button" onClick={() => void logout()}>Abmelden</button></div>
      {accounts.map((account) => <div className="account-setting-card" key={account.id}><div className="account-avatar large">{account.email.slice(0, 1).toUpperCase()}</div><div><strong>{account.label}</strong><span>{account.email}</span></div><span className="connected-pill">VERBUNDEN</span><button className="subtle-button" onClick={() => void remove(account)}>Entfernen</button></div>)}
      {health?.encryptionConfigured ? <div className="connection-actions"><button className="add-account" onClick={() => setShowForm(!showForm)}><MailPlus size={16} /> E-Mail-Konto hinzufügen <span>{showForm ? "−" : "+"}</span></button></div> : <div className="connection-card"><strong>Verschlüsselung nicht konfiguriert</strong><span>Der Serverbetreiber muss ENCRYPTION_KEY einrichten.</span></div>}
      {showForm && <form className="imap-form" onSubmit={addImap}><div className="imap-form-title"><strong>IMAP / SMTP verbinden</strong><span>Zugangsdaten werden nur verschlüsselt auf dem Backend gespeichert. TLS wird erzwungen.</span></div><button type="button" className="gmail-preset" onClick={() => setForm((current) => ({ ...current, username: current.email || current.username, imapHost: "imap.gmail.com", imapPort: "993", smtpHost: "smtp.gmail.com", smtpPort: "465" }))}>Gmail-Serverdaten eintragen</button><div className="connection-fields">{field("email", "E-Mail-Adresse", "email", "name@gmail.com")}{field("username", "Benutzername", "text", "deine vollständige E-Mail-Adresse")}{field("password", "Google-App-Passwort", "password")}{field("imapHost", "IMAP-Server", "text", "imap.gmail.com")}{field("imapPort", "IMAP-Port", "number", "993")}{field("smtpHost", "SMTP-Server", "text", "smtp.gmail.com")}{field("smtpPort", "SMTP-Port", "number", "465")}</div><p className="gmail-help">Bei privaten Gmail-Konten ist IMAP bereits aktiviert. Google-App-Passwörter setzen die Bestätigung in zwei Schritten voraus. Verwende das App-Passwort hier statt deines normalen Google-Passworts. Google empfiehlt, wenn möglich, „Über Google anmelden“ zu verwenden.</p><button className="connection-submit" disabled={busy}>{busy ? "Verbindung wird geprüft …" : "Verbindung prüfen und Konto speichern"}</button></form>}
    </>}
    {notice && <p className="connection-notice" role="status">{notice}</p>}
    <p className="coming-note">Zum Schutz deiner Konten ist die Smart-Mail-Anmeldung ein eigener Zugangsschlüssel. Verwende ihn nicht mit deinem Google-App-Passwort.</p>
  </div>;
}
function ComposeModal({ onClose, onSend }: { onClose: () => void; onSend: (to: string, subject: string, text: string) => Promise<void> }) { const [to, setTo] = useState(""); const [subject, setSubject] = useState(""); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const send = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { await onSend(to, subject, text); } catch (reason) { setError(reason instanceof Error ? reason.message : "Versand fehlgeschlagen."); } finally { setBusy(false); } }; return <div className="modal-scrim" onClick={onClose}><form className="compose-modal glass-panel" onSubmit={send} onClick={(event) => event.stopPropagation()}><div className="compose-head"><strong>Neue Nachricht</strong><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="compose-fields"><div className="compose-field"><span>An</span><input required type="email" autoFocus value={to} onChange={(event) => setTo(event.target.value)} placeholder="Empfänger" /></div><div className="compose-field"><span>Betreff</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Betreff hinzufügen" /></div></div><textarea required value={text} onChange={(event) => setText(event.target.value)} placeholder="Schreibe deine Nachricht …" />{error && <p className="gmail-help">{error}</p>}<div className="compose-foot"><button className="send-button" disabled={busy}><Send size={15} />{busy ? "Wird gesendet …" : "Senden"}</button><span>Versand über dein verbundenes Konto</span><button type="button" className="icon-button" onClick={onClose}><Trash2 size={16} /></button></div></form></div>; }
