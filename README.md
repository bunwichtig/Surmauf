# Lichtung

Gemeinsam ein Dorf im Wald aufbauen, direkt im Browser. Allein oder mit Freunden über einen Einladungslink.
Mit einem ganz leichten Überlebens-Teil: Siedler brauchen Essen, im Winter Holz zum Heizen.

**Spielen:** https://bunwichtig.github.io/Surmauf/

## So spielt ihr zusammen

1. Einer öffnet die Seite, gibt Name, Dorfname und Passwort ein und klickt **Dorf öffnen**.
2. Unter dem Spielfeld steht der **Einladungslink**. Kopieren und an die anderen schicken.
3. Die anderen öffnen den Link, geben ihren Namen ein und klicken **Dorf beitreten**. Das geht jederzeit, auch mitten im Spiel.

Der Browser des Gastgebers rechnet das Dorf und muss offen bleiben. Die Verbindung läuft direkt von Browser zu Browser (WebRTC über PeerJS), genau wie bei BombRe. Es gibt keinen eigenen Server.

## Spielen

- **Laufen:** WASD oder Pfeiltasten. Auf dem Handy gibt es Tasten.
- **Arbeiten:** Leertaste oder E gedrückt halten vor Baum (Holz), Stein (Stein) oder Beerenstrauch (Nahrung). Bäume und Sträucher wachsen nach, nur nicht im Winter.
- **Bauen:** Gebäude unten wählen (oder 1 bis 8) und auf freie Wiese klicken. B baut direkt vor der Figur, Esc oder Rechtsklick bricht ab.
- Alles landet im **gemeinsamen Vorrat**, alle bauen am selben Dorf.

| Gebäude | Kosten | Wirkung | ab Stufe |
|---|---|---|---|
| 🔥 Feuerstelle | 5 Holz | Licht in der Nacht, ohne Feuer kommen keine Siedler | Lagerplatz |
| 🛖 Hütte | 10 Holz | 2 Betten | Lagerplatz |
| 🧺 Sammlerhütte | 8 Holz | 1 Siedler sammelt Beeren in der Nähe, bis +3 Nahrung/Tag | Lagerplatz |
| 🪓 Holzfäller | 8 Holz, 3 Stein | bis +4 Holz/Tag, braucht Bäume in der Nähe | Siedlung |
| 🌾 Acker | 6 Holz | +5 Nahrung/Tag, nicht im Winter | Siedlung |
| ⛏️ Steinbruch | 12 Holz | bis +3 Stein/Tag, braucht Felsen in der Nähe | Siedlung |
| 🏠 Steinhaus | 10 Holz, 12 Stein | 4 Betten | Weiler |
| ⛲ Dorfbrunnen | 20 Holz, 25 Stein | Ziel für die Stufe „Dorf“ | Weiler |

**Siedler** ziehen mittags und morgens ein, wenn es eine Feuerstelle, ein freies Bett und genug Nahrung gibt. Sie arbeiten tagsüber in den Arbeitsgebäuden und gehen nachts heim.

**Überleben (leicht):** Ein Tag dauert 2 Minuten, jede Jahreszeit 3 Tage. Jeden Morgen isst jeder Siedler 1 Nahrung. Im Winter wächst nichts, und je 2 Siedler brauchen 1 Holz zum Heizen. Wer zwei Tage hungert oder friert, zieht weg. Spieler selbst können nicht sterben.

**Stufen:** Lagerplatz → Siedlung (2 Siedler) → Weiler (6 Siedler) → Dorf (Brunnen und 10 Siedler). Jede Stufe schaltet Gebäude frei und bleibt erreicht.

## Spielstand

Der Gastgeber speichert das Dorf alle 15 Sekunden im Browser (localStorage), unter dem Dorfnamen. Mitspieler bekommen regelmäßig eine Kopie.
Öffnet später jemand anderes das Dorf und ein Mitspieler hat einen neueren Stand, wird dieser beim Beitreten automatisch übernommen.

## Lokal testen

```sh
python -m http.server 8000
```

Dann `http://localhost:8000/?local` in zwei Tabs öffnen. Mit `?local` laufen die Tabs ohne Internet über den Browser selbst.

## Veröffentlichen

Der Workflow `.github/workflows/pages.yml` veröffentlicht bei jedem Push auf `main` über GitHub Pages (Settings → Pages → Quelle „GitHub Actions“) und trägt die Versionskennung ein.
Die Technik für den Mehrspielermodus ist in BombRe unter `docs/online-multiplayer.md` beschrieben.
