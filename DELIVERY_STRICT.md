# Livraison stricte Meezane

## Autorite visuelle

Les six maquettes Adobe Illustrator sont l'autorite visuelle desktop a 1920 px :

- `Meezan Website.ai`
- `Meezan Website EXPERIENCES.ai`
- `Meezan Website Reservation.ai`
- `Meezan Website Blog.ai`
- `Meezan Website Chambres.ai`
- `Meezan Website Gallerie.ai`

Le site conserve les mesures Illustrator, les rasters de texte Illustrator et les crops de correction approuves. Les controles desktop comparent chaque pixel RGBA, sans echantillonnage.

Il n'existe pas de maquette Illustrator mobile ou tablette. Ces largeurs sont donc controlees pour l'absence de casse, de debordement et d'asset manquant, pas pour une parite avec une maquette inexistante.

## Fichiers a modifier

| Besoin | Fichier source |
|---|---|
| Textes, styles de texte, medias et remplacements | `src/data/siteContent.json` |
| Routes, SEO, header et actions des CTA | `src/data/pageConfig.js` |
| Geometrie des medias, carrousels et fleches | `src/data/mediaConfig.js` |
| Crops Illustrator de correction | `src/data/exactOverlays.js` |
| Rendu et composants interactifs | `src/components/ExactIllustratorPage.jsx` |

`siteContent.json` est une source auteur. `npm run content:template` genere uniquement `siteContent.generated.json` pour comparaison et ne doit jamais ecraser la source auteur.

## Modifier un texte

1. Rechercher la page et l'identifiant `text-XX` dans `src/data/siteContent.json`.
2. Modifier `value` et, si necessaire, les proprietes de `style`.
3. Ne pas changer `bounds` sans une nouvelle mesure Illustrator.
4. Regenerer les rasters et exports Illustrator avec `npm run illustrator:export`.
5. Produire et controler la candidate avec `npm run visual:candidate`.
6. Approuver seulement apres revue avec `npm run visual:approve` puis `npm run assets:approve`.
7. Terminer avec `npm run delivery:strict`.

Le texte visible est rasterise par Adobe Illustrator. Un simple `npm run build` apres une modification de texte ne suffit pas.

## Modifier une image de contenu

1. Ajouter un PNG dans `public/assets/`.
2. Renseigner `replacementFile` sur le media concerne dans `siteContent.json`.
3. Utiliser exactement les dimensions du box runtime indique dans `mediaConfig.js` ou dans `bounds`.
4. Lancer `npm run visual:candidate` pour composer le remplacement dans la reference candidate.
5. Approuver avec `npm run visual:approve` puis `npm run assets:approve`.
6. Lancer `npm run delivery:strict`.

Les images hero et backdrop sont integrees au fond Illustrator. Le validateur refuse `replacementFile` pour ces images. Elles doivent etre modifiees dans le `.ai`, puis regenerees.

## Modifier un bouton

- Le libelle visuel reste dans `siteContent.json` sous son `text-XX`.
- L'action est explicite dans `textActions` de `pageConfig.js`.
- Les boutons du header sont dans `headerNavItems` et `headerBookAction`.
- Les zones de carrousel et de scroll sont dans `mediaConfig.js`.

Les actions ne dependent jamais du texte affiche. Renommer un CTA ne supprime donc plus silencieusement son comportement.

Pour ajouter un nouveau bouton, ajouter sa representation visuelle, sa zone, son action explicite, ses attributs accessibles et un smoke test. Toute nouvelle geometrie visuelle doit etre revue dans la candidate avant approbation.

## Modifier le SEO

Modifier `seoContent` et `businessSchema` dans `src/data/pageConfig.js`. Les descriptions SEO sont explicites et ne sont plus fabriquees a partir de textes Illustrator repetes.

## Cycle d'approbation

```powershell
npm ci
npm run illustrator:export
npm run visual:candidate
```

Revoir obligatoirement :

- `visual-audit/candidate-illustrator/*.png`
- `visual-audit/candidate-browser/*.png`
- `visual-audit/candidate-report.json`

Apres validation humaine :

```powershell
npm run visual:approve
npm run assets:approve
npm run delivery:strict
```

`visual:approve` et `assets:approve` sont des commandes volontaires. Elles ne doivent jamais etre lancees uniquement pour faire disparaitre un echec.

## Commande de livraison

```powershell
npm run delivery:strict
```

Cette commande refuse la livraison si :

- une source Illustrator a change sans nouvel export ;
- un asset differe de son SHA-256 approuve ;
- une route, une dimension ou un identifiant configure est incoherent ;
- une image est absente, invalide ou mal dimensionnee ;
- le build contient un chemin local absolu ;
- le paquet de deploiement depasse 200 MiB ;
- une erreur console, runtime, reseau, HTTP, image ou police apparait ;
- une route deborde sur desktop, tablette ou mobile ;
- la fidelite Illustrator depasse la politique approuvee ;
- un seul pixel differe de la baseline navigateur approuvee.

## Fichiers generes a ne pas modifier

- `dist/**`
- `public/assets/illustrator/**`
- `public/assets/illustrator-spec/**`
- `public/assets/illustrator-raster/**`
- `public/assets/illustrator-text/**`
- `public/assets/illustrator-driven/*-background.png`
- `public/assets/illustrator-driven/*-exact.png`
- `visual-audit/**`
- `visual-baseline/**`, sauf par `visual:approve`
- `delivery/runtime-assets.lock.json`, sauf par `assets:approve`

## Conditions manuelles avant remise

- Faire valider les six baselines par le client ou le responsable de projet.
- Confirmer le navigateur et l'environnement Windows de reference.
- Confirmer la plateforme d'hebergement et ses regles de reecriture SPA.
- Obtenir des maquettes mobile/tablette si une fidelite contractuelle est attendue sur ces formats.
- Verifier les licences commerciales de `BreathingPersonalUseOnly.ttf`, `SignPainter.ttc`, `Erstoria.ttf` et `AALMAGHRIBI_v4.9.6.otf`.
- Archiver les `.ai`, polices, images liees, locks SHA-256 et baselines avec la livraison.
