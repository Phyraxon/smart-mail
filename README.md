# Smart Mail

Smart Mail ist jetzt als plattformübergreifende Web-App mit installierbarer PWA-Oberfläche ausgelegt. Das Premium-Dark-Glass-Design bleibt erhalten und passt sich auch an Smartphone-Bildschirme an.

## Aktueller Stand

Die App zeigt weiterhin **Beispieldaten im Demo-Modus**. IMAP/SMTP, echte Konten, E-Mail-Versand und KI-Aufrufe sind noch nicht implementiert. Die UI-Shell kann als Web-App geöffnet und auf unterstützten Geräten zum Startbildschirm hinzugefügt werden.

Eine statische Website reicht später nicht für echte E-Mail-Konten aus: Dafür braucht Smart Mail einen sicheren Backend-Dienst für OAuth, IMAP/SMTP und geschützte Secrets. Keine Zugangsdaten oder API-Schlüssel ins Frontend eintragen.

## Lokal starten

Voraussetzungen: Node.js 22 oder neuer und npm.

```bash
npm ci
npm run dev
```

Produktionsdateien bauen:

```bash
npm run build
npm run preview
```

## PWA-Icon und Offline-Start

Die Markenreferenz wurde als quadratisches App-Symbol umgesetzt. Webmanifest, Favicon, Apple Touch Icon und Service Worker liegen in `public/`. Einmal geladene Oberflächen-Dateien werden für den nächsten Start zwischengespeichert.

## GitHub

`.github/workflows/deploy-pages.yml` baut die App und veröffentlicht sie bei Pushes nach `main` über GitHub Pages. Der Quellcode enthält keine Secrets. GitHub Pages ist ein statischer Host; aktuell würde dort nur die Demo-Oberfläche erscheinen. GitHub Pages ist für die spätere Bereitstellung eines E-Mail-SaaS nicht der geeignete Host. Für echte E-Mail-Funktionen muss ein Backend auf einem passenden Anwendungs-Host ergänzt werden.

GitHub Pages mit GitHub Free benötigt ein öffentliches Repository. Vor dem ersten Push sollte deshalb die Repository-Sichtbarkeit festgelegt werden.

## Struktur

```text
src/                    React-Oberfläche, responsive Styles und Demo-Daten
public/                 PWA-Manifest, Service Worker und App-Icons
.github/workflows/      Build- und GitHub-Pages-Deployment
```
