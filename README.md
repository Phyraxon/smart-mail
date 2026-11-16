# Smart Mail

Smart Mail ist jetzt als plattformübergreifende Web-App mit installierbarer PWA-Oberfläche ausgelegt. Das Premium-Dark-Glass-Design bleibt erhalten und passt sich auch an Smartphone-Bildschirme an.

## Konten verbinden

Die Konteneinstellungen enthalten eine Smart-Mail-Anmeldung mit eigenem Zugangsschlüssel sowie ein IMAP/SMTP-Formular. Für Gmail gibt es eine Voreinstellung mit `imap.gmail.com` und `smtp.gmail.com`. IMAP und SMTP werden vor dem Speichern mit TLS getestet. Mail-Passwörter werden mit AES-256-GCM verschlüsselt im Backend-Datenspeicher abgelegt.

Die Hauptansicht zeigt weiterhin deutlich gekennzeichnete Beispieldaten. Das Verbinden eines Kontos schaltet die Live-Synchronisierung, Nachrichtenanzeige und den echten Versand noch nicht frei.

GitHub Pages kann nur statische Dateien hosten und kann diese Backend-Funktionen nicht ausführen. Für eine nutzbare öffentliche Web-App muss das Docker-Backend bei einem Anwendungs-Host mit dauerhaftem Datenspeicher laufen; `APP_URL`, Schlüssel und Google-Zugangsdaten gehören in dessen Secrets-Verwaltung, niemals ins Repository.

## Lokal starten

Voraussetzungen: Node.js 22 oder neuer und npm. Das Backend und Vite laufen in getrennten Terminals.

```bash
npm ci
npm run dev
```

In einem zweiten Terminal:

```bash
Copy-Item .env.example .env
npm run server
```

Erzeuge zwei verschiedene 32-Byte-Schlüssel und trage sie als `SESSION_KEY` und `ENCRYPTION_KEY` ein. Setze außerdem ein separates zufälliges `APP_ACCESS_PASSWORD` mit mindestens 20 Zeichen. Verwende dafür nicht dein Google-App-Passwort:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Bei privaten Gmail-Konten ist IMAP standardmäßig aktiv. Google-App-Passwörter setzen aktivierte Bestätigung in zwei Schritten voraus. Das App-Passwort kommt ins Smart-Mail-Kontoformular, nicht in `.env`. Google empfiehlt, wenn möglich, „Über Google anmelden“ zu verwenden.

Produktionsdateien bauen:

```bash
npm run build
npm run preview
```

## PWA-Icon und Offline-Start

Die Markenreferenz wurde als quadratisches App-Symbol umgesetzt. Webmanifest, Favicon, Apple Touch Icon und Service Worker liegen in `public/`. Einmal geladene Oberflächen-Dateien werden für den nächsten Start zwischengespeichert.

Das Backend kann als einzelner Docker-Container bereitgestellt werden. Dabei muss `APP_DATA_DIR` auf einem persistenten Volume liegen, weil dort verschlüsselte Kontodaten gespeichert werden.

## GitHub

`.github/workflows/deploy-pages.yml` baut die App und veröffentlicht sie bei Pushes nach `main` über GitHub Pages. Das ist weiterhin nur die statische Demo-Oberfläche. Das Backend kann über `Dockerfile` bei einem geeigneten Host laufen. Die externe Bereitstellung ist noch nicht konfiguriert.

GitHub Pages mit GitHub Free benötigt ein öffentliches Repository. Vor dem ersten Push sollte deshalb die Repository-Sichtbarkeit festgelegt werden.

## Struktur

```text
src/                    React-Oberfläche, responsive Styles und Demo-Daten
server/                 Smart-Mail-Anmeldung, IMAP/SMTP-Test und verschlüsselte Kontospeicherung
Dockerfile              Container für das Backend und den gebauten Web-Client
public/                 PWA-Manifest, Service Worker und App-Icons
.github/workflows/      Build- und GitHub-Pages-Deployment
```
