# Audit des retours client

Date de verification : 2026-09-11

Presentation auditee : `meezan-client-feedback.pptx`

SHA-256 : `59c1a3b0ff80207f87ad22ee63427bfaf3dc5e7ed9219b53b8738046fcdc3da7`

Les captures de la presentation servent uniquement a localiser les remarques. Les fichiers Illustrator archives, leurs exports et leurs metriques restent l'autorite visuelle. Aucune capture PPTX n'est utilisee par le site.

| Slide | Route ou zone | Remarque verifiee | Preuve | Statut |
| --- | --- | --- | --- | --- |
| 1 | Home et responsive | Le calendrier Home est masque au chargement, s'ouvre au clic, accepte une plage de dates et met a jour le nombre de nuits. Les six routes restent dans la largeur de l'ecran. | `route:smoke`, `home-calendar-open.png`, six captures `*-mobile-390.png` | Verifie |
| 2 | Home, titre de presentation | `L'art de l'equilibre` reprend la typographie script et l'alignement du fichier Illustrator. | `home-text.svg`, capture desktop Home | Verifie |
| 3 | Home, premier stamp | Le stamp et son placement proviennent de l'export Illustrator exact. | `home-top-seal-exact.png`, capture desktop Home | Verifie |
| 4 | Home, bloc Meezane | La typographie et l'alignement du bloc sont ceux des contours Illustrator. | `home-text.svg`, capture desktop Home | Verifie |
| 5 | Home, cinq rubriques | Le texte est masque au repos, revele par chacune des cinq rubriques, reste visible quand le pointeur entre dans la copie, puis se remasque hors zone. Il reste visible sur appareil sans survol. | Assertions sur les cinq zones dans `route:smoke`, `home-balance-hover.png` | Verifie |
| 6 | Home, bloc Shala | La phrase manuscrite et les textes du bloc utilisent les exports et metriques Illustrator. | `home-text.svg`, capture desktop Home | Verifie |
| 7 | Chambres, hero et stamp | Le titre script et le stamp sont issus de la source Chambres, avec leurs dimensions et alignements d'origine. | `chambres-text.svg`, `chambres-top-seal-exact.png`, capture desktop Chambres | Verifie |
| 8 | Galerie, hero et stamp | Le titre script et le stamp sont issus de la source Galerie. | `galerie-text.svg`, `galerie-top-seal-exact.png`, capture desktop Galerie | Verifie |
| 9 | Experiences, hero et stamp | Le titre script du hero et le stamp correspondent a la composition Illustrator. | `experiences-text.svg`, `experiences-top-seal-exact.png`, capture desktop Experiences | Verifie |
| 10 | Experiences, expertise evenementielle | La phrase manuscrite remplace la typographie generique signalee. | `experiences-text.svg`, capture desktop Experiences | Verifie |
| 11 | Experiences, experiences signature | La ligne manuscrite et le titre serif conservent la typographie et l'alignement Illustrator. | `experiences-text.svg`, capture desktop Experiences | Verifie |
| 12 | Experiences, Terre & Mains | Le trait est place au-dessus de `TERRE`, sans souligner `MAINS`. | `experiences-terre-rule-exact.png`, capture desktop Experiences | Verifie |
| 13 | Blog, hero et stamp | Le titre `Blog`, la copie approuvee, la typographie script et le stamp sont rendus dans la geometrie Illustrator. Le media initial `placed-08` provient a nouveau de l'artboard Blog, et non d'un asset Galerie. | `blog-text.svg`, `blog-top-seal-exact.png`, `blog-media-08-exact.jpg`, capture desktop Blog, assertion `route:smoke` | Verifie |
| 14 | Reservation, hero et stamp | Le titre `Important` utilise la typographie script et le stamp conserve la composition Illustrator. | `reservation-text.svg`, `reservation-top-seal-exact.png`, capture desktop Reservation | Verifie |
| 15 | Reservation et calendrier Home | Le calendrier Reservation est absent avant clic, s'ouvre sur un champ de date, maintient la selection jusqu'au depart et se referme ensuite. Home reutilise le meme composant de calendrier et le meme comportement. | Assertions fonctionnelles dans `route:smoke`, `reservation-calendar-open.png`, `home-calendar-open.png` | Verifie |
| 16 | Toutes les routes | Echelle, nettete raster, textes selectionnables, polices et responsive ont ete controles sur les six pages. | Matrice `1440x900`, `768x1024@2x`, `730x1024@2x`, `390x844@3x`; test Ctrl+A; selection pointeur; controle de densite raster | Verifie |

## Inventaire des preuves

La commande suivante produit les preuves dans le dossier choisi :

```sh
MEEZAN_CAPTURE_DIR=/chemin/vers/audit npm run route:smoke
```

Fichiers produits :

- `home.png`, `experiences.png`, `reservation.png`, `blog.png`, `chambres.png`, `galerie.png`
- `home-mobile-390.png`, `experiences-mobile-390.png`, `reservation-mobile-390.png`, `blog-mobile-390.png`, `chambres-mobile-390.png`, `galerie-mobile-390.png`
- `home-balance-hover.png`
- `home-intro-selection.png`
- `home-calendar-open.png`
- `reservation-calendar-open.png`

## Controles de livraison

- `npm run route:smoke` valide les routes, interactions, selections de texte, dimensions Illustrator et densites raster.
- `npm run build:strict` valide les six pages, le verrou des assets runtime et la limite de 200 MiB.
- `npm run verify:provenance` valide les hashes des sources Illustrator et la presence Git de chaque asset runtime.
- Le script PowerShell historique `visual:audit` n'est pas executable dans l'environnement macOS actuel. Les captures navigateur et comparaisons directes aux exports Illustrator ont ete utilisees pour cette revue.

## Reconciliation raster

Les comparaisons couvrent chaque pixel RGBA des artboards a 1920 px, sans echantillonnage. Un pixel est compte comme significativement different lorsqu'au moins un canal a un delta strictement superieur a 36.

| Route | Dimensions comparees | Pixels significativement differents |
| --- | --- | --- |
| Home | `1920x12229` | `1.007663 %` |
| Experiences | `1920x16004` | `0.594835 %` |
| Reservation | `1920x4074` | `1.406403 %` |
| Blog | `1920x9235` | `1.540798 %` |
| Chambres | `1920x11568` | `0.498727 %` |
| Galerie | `1920x6098` | `0.691825 %` |

- La premiere reference Experiences de `1920x14400` etait une preview tronquee. Elle a ete remplacee pour la mesure par l'export Illustrator normalise complet de `1920x16004`, SHA-256 `d5d4599ff4ec73ae4a3f4d19463beb2de1eca43c3c8dae8570424853305fe5da`.
- L'ancien ecart Blog de `5.306561 %` provenait principalement de `placed-08`, qui reutilisait par erreur la villa de Galerie. Le crop de la course en sacs issu de l'artboard Blog ramene la mesure a `1.540798 %`. Les differences restantes incluent les corrections de copie et de navigation explicitement approuvees.

## Provenance du media Blog 08

- Source : `Meezan Website Blog.ai`, SHA-256 `17f75185edb1d3d63c71bbf12b19f0fd21433ae76b059b571149cf7b7ca28d28`.
- Crop Illustrator : `x=378`, `y=4842`, `width=1199`, `height=709`, echelle `1`.
- Sortie runtime : `public/assets/illustrator-driven/blog-media-08-exact.jpg`, JPEG qualite `0.92`, `350026` octets, SHA-256 `cf130fb18bb0f07d6462d5dc2b181a3ec445093c05e0ac39608ffa039be93e35`.
- Export reproductible, sans dependance tierce :

```sh
npm run illustrator:crop -- "$MEEZAN_SOURCE_DIR/Meezan Website Blog.ai" public/assets/illustrator-driven/blog-media-08-exact.jpg 378 4842 1199 709 1 0.92
```

## Provenance du hero Home

- Source : `Meezan Website.ai`, SHA-256 `af383e24b3d253ca1a8efa84fb0059d5e0c426bdb86c8ef92de8b703b13ca2fe`.
- Image embarquee PDF : objet `xref 28`, `5520x3680`, 8 bits, espace colorimetrique ICC. Le master PNG extrait a pour SHA-256 `39ce15944e818a9c403d0e8d75f231889caee7afc9496baafd5192139896b10e`.
- Placement Illustrator : `x=-14`, `y=-129.001`, `width=1957`, `height=1304.667`.
- Photo runtime : `public/assets/images/home-hero-native.jpg`, dimensions natives conservees, JPEG qualite 80, SHA-256 verrouille `a8cefe3b65d76c6406f0e321b0c4e3bd90a27225d6b11cf77c419d66fc3b068e`.
- Chrome vectoriel : `public/assets/illustrator-driven/home-hero-chrome-exact.png`, export `144 dpi` reproductible avec `scripts/export-home-hero-chrome.jsx`.

Extraction et conversion reproductibles :

```sh
python3 -m venv /tmp/meezan-illustrator-export
/tmp/meezan-illustrator-export/bin/pip install -r scripts/requirements-illustrator-export.txt
/tmp/meezan-illustrator-export/bin/python scripts/extract-illustrator-image.py "$MEEZAN_SOURCE_DIR/Meezan Website.ai" 28 /tmp/home-hero-native.png
sips -s format jpeg -s formatOptions 80 /tmp/home-hero-native.png --out public/assets/images/home-hero-native.jpg
```

## Paquet de production

- Archive : `Meezan-site-production-2026-09-11.zip`.
- Taille : `189863075` octets.
- SHA-256 : `3437fd8c127beadf6c99521724587cb53959c6eb948a26fbf41b6a7109e7daf4`.
- Integrite : `unzip -t` ne signale aucune erreur.
- Contenu controle : `home-hero-native.jpg`, `home-hero-chrome-exact.png` et `blog-media-08-exact.jpg` sont presents ; l'ancien `home-hero-exact.png` est absent.
