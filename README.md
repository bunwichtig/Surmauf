# Lichtung

Gemeinsam ein Dorf im Wald planen und bauen, direkt im Browser. Ein Aufbau-Strategiespiel mit Baumenü. Allein oder mit Freunden über einen Einladungslink.
Mit einem ganz leichten Überlebens-Teil: Siedler brauchen Essen, im Winter Holz zum Heizen.

**Spielen:** https://bunwichtig.github.io/Surmauf/

## So spielt ihr zusammen

1. Einer öffnet die Seite, gibt Name, Dorfname und Passwort ein und klickt **Dorf öffnen**.
2. Unter dem Spielfeld steht der **Einladungslink**. Kopieren und an die anderen schicken.
3. Die anderen öffnen den Link, geben ihren Namen ein und klicken **Dorf beitreten**. Das geht jederzeit, auch mitten im Spiel.

Der Browser des Gastgebers rechnet das Dorf und muss offen bleiben. Die Verbindung läuft direkt von Browser zu Browser (WebRTC über PeerJS), genau w## Spielen

- **Bauen:** Gebäude unten wählen (oder Taste 1 bis 8) und auf freie Wiese klicken. 🧹 Abreißen (X) entfernt ein Gebäude und gibt die Hälfte der Kosten zurück. Esc oder Rechtsklick bricht ab.
- **Karte verschieben:** mit Maus oder Finger ziehen, oder WASD und Pfeiltasten.
- **Tempo:** Der Gastgeber kann 1×, 2× oder 4× einstellen.
- Alle Mitspieler bauen am selben Dorf mit einem gemeinsamen Vorrat. Wo die anderen gerade hinzeigen, sieht man als farbigen Rahmen mit Namen.
- Arbeitsgebäude ohne freien Siedler zeigen 💤, mit zu wenig Natur in der Nähe ⚠️. Fährt man mit der Maus über ein Gebäude, steht unten, was los ist.

| Gebäude | Kosten | Wirkung | ab Stufe |
|---|---|---|---|
| 🔥 Feuerstelle | 5 Holz | Licht in der Nacht, ohne Feuer kommen keine Siedler | Lagerplatz |
| 🛖 Hütte | 10 Holz | 2 Betten | Lagerplatz |
| 🧺 Sammlerhütte | 8 Holz | 1 Siedler sammelt Beeren in der Nähe, bis +3 Nahrung/Tag | Lagerplatz |
| 🪓 Holzfäller | 8 Holz | bis +4 Holz/Tag, braucht Bäume in der Nähe | Lagerplatz |
| 🌾 Acker | 6 Holz | +5 Nahrung/Tag, nicht im Winter | Lagerplatz |
| ⛏️ Steinbruch | 12 Holz | bis +3 Stein/Tag, braucht Felsen in der Nähe | Siedlung |
| 🏠 Steinhaus | 10 Holz, 12 Stein | 4 Betten | Weiler |
| ⛲ Dorfbrunnen | 20 Holz, 25 Stein | Ziel für die Stufe „Dorf“ | Weiler |

Ihr startet mit 40 Holz, 20 Nahrung und 3 Gründer-Siedlern. **Siedler** erledigen alle Arbeit. Weitere ziehen ein, wenn es eine Feuerstelle, ein freies Bett und genug Nahrung gibt. Jedes Arbeitsgebäude braucht einen Siedler ohne Arbeit.

**Überleben (leicht):** Ein Tag dauert 2 Minuten, jede Jahreszeit 3 Tage. Jeden Morgen isst jeder Siedler 1 Nahrung. Im Winter wächst nichts, und je 2 Siedler brauchen 1 Holz zum Heizen. Wer zwei Tage hungert oder friert, zieht weg.

**Stufen:** Lagerplatz → Siedlung (5 Siedler) → Weiler (8 Siedler) → Dorf (Brunnen und 14 Siedler). Jede Stufe schaltet Gebäude frei und bleibt erreicht.

## Iterationen

- **Iteration 2 (aktuell):** Strategie mit Baumenü, ohne Spielfigur. Hauptordner.
- **Iteration 1:** mit eigener Spielfigur, die läuft und von Hand sammelt. Spielbar unter https://bunwichtig.github.io/Surmauf/iteration-1/, Code im Branch `iteration-1` und im Ordner `iteration-1/`. Beide Versionen haben getrennte Räume und Spielstände.

fe schaltet Gebäude frei und bleibt erreicht.

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
