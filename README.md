# 🪚 CalepinagePro — Optimisation de Découpe de Panneaux pour la Menuiserie

Application web moderne d'optimisation de débit et de calepinage 2D de panneaux en menuiserie et agencement, développée avec **Next.js (App Router)**, **TypeScript**, **Tailwind CSS** et **Lucide Icons**.

Prête pour un déploiement direct et instantané sur **Vercel**.

---

## ✨ Fonctionnalités Clés & Spécifications Respectées

### 1. ⚙️ Configuration du Projet & Trait de Scie (Kerf)
- Saisie au dixième de millimètre de l'épaisseur de la lame (ex : `3.2 mm`, `2.4 mm`, etc.).
- Déduction géométrique exacte du trait de scie entre chaque pièce adjacente et lors de chaque passe guillotine.
- Raccourcis pour les standards d'atelier et réglage du seuil de détection des chutes réutilisables.

### 2. 📦 Gestion du Stock de Panneaux
- Ajout, modification directe en ligne, duplication et suppression des panneaux bruts en stock.
- Dimensions précises en millimètres ($L \times l$).
- Prise en charge multi-matières (MDF 19mm, Contreplaqué bouleau 15mm, Mélaminé blanc 18mm, etc.) et multi-formats.
- Raccourcis pour les formats standards du commerce (2800×2070, 2500×1220, 2440×1220, 3050×1300).

### 3. 📋 Liste de Débit (Pièces à Découper)
- Saisie des pièces avec désignation/étiquette, matière associée, dimensions ($L \times l$), quantité et code couleur visuel.
- Option **Fil du bois** : bascule pour autoriser la rotation libre à 90° ou forcer le sens strict du fil de bois.
- **Import / Export CSV** pour synchroniser avec vos tableurs (Excel, Calc) ou logiciels de conception.

### 4. 🧠 Algorithme d'Optimisation 2D Guillotine
- Moteur 2D Guillotine Cutting Stock respectant les contraintes réelles de coupe en atelier (scie à format et scie à panneaux horizontale/verticale).
- Heuristiques de placement Best Fit Decreasing avec tri multi-critères (Surface, Longueur, Périmètre).
- Regroupement automatique par matière.

### 5. 📊 Visualisation Graphique Vectorielle & Résultats
- Rendu interactif haute précision en **SVG vectoriel** (parfaitement net sur grand écran ou tablette d'atelier).
- Cotes extérieures et intérieures, étiquettes des pièces, repérage couleur et icône de rotation.
- Visualisation en pointillés jaunes du passage de lame (kerf).
- Détection et identification hachurée des **chutes réutilisables** avec bouton pour **les réintégrer au stock en 1 clic**.
- Récapitulatif KPI : Taux de rendement matière (%), Taux de chute (%), panneaux consommés vs disponibles, surface utile vs brute, et longueur totale de coupe linéaire (m).
- **Mode Dossier Atelier / Impression** : mise en page optimisée pour l'impression A4 avec feuille de débit et cases à cocher pour l'opérateur.

---

## 🚀 Démarrage Rapide

### Prérequis
- Node.js 18+ (recommandé 20+)
- npm ou pnpm

### Installation & Lancement local
```bash
# Cloner le dépôt et se placer dans le dossier
cd calepinage

# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

---

## ☁️ Déploiement sur Vercel

Le projet est configuré selon les standards officiels Next.js App Router pour Vercel :

1. Poussez le projet sur GitHub / GitLab / Bitbucket.
2. Rendez-vous sur [Vercel Dashboard](https://vercel.com/new).
3. Importez votre dépôt Git.
4. Vercel détecte automatiquement le framework **Next.js**.
5. Cliquez sur **Deploy** — l'application est en ligne en quelques secondes !
