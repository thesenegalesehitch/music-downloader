# 🎵 Music Downloader

Une solution puissante et multi-plateforme pour télécharger et écouter de la musique. Récupérez les métadonnées de Spotify, Apple Music et Deezer, téléchargez de l'audio de haute qualité avec des tags ID3v2.4 complets, et gérez votre bibliothèque via une interface web moderne.

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)

## ✨ Fonctionnalités

- **Support Multi-Plateforme**: Téléchargez depuis Spotify, Apple Music et Deezer.
- **Interface Web Moderne**: Une UI responsive et intuitive pour rechercher, télécharger et écouter.
- **Bibliothèque Locale**: Gérez et écoutez vos morceaux téléchargés directement depuis le navigateur.
- **Visualiseur Audio**: Visualiseur de fréquences en temps réel pour une expérience immersive.
- **Téléchargeur Vidéo**: Téléchargez des vidéos YouTube avec intégration des métadonnées.
- **Résolution Intelligente de Liens**: Gère automatiquement les liens courts Deezer et les URLs de services.
- **Métadonnées Complètes**: Extrait et intègre toutes les infos (Titre, Artiste, Album, Genre, Année, Cover Art, Paroles, Crédits, ISRC, Label).
- **Haute Qualité**: Téléchargements audio jusqu'à 320kbps.
- **Pochettes d'Album HD**: Récupère les pochettes en haute résolution (iTunes/Deezer).
- **Paroles Synchronisées**: Sauvegarde et affiche les paroles synchronisées (LRC) dans le lecteur web.
- **Streaming Live**: Écoutez de la musique en streaming avec paroles sans attendre le téléchargement.

## 📋 Table des Matières

- [Installation](#-installation)
- [Démarrage Rapide](#-démarrage-rapide)
- [Interface Web](#-interface-web)
- [Utilisation en Ligne de Commande](#-utilisation-en-ligne-de-commande)
- [Configuration](#-configuration)
- [Contribution](#-contribution)
- [Licence](#-licence)

## 🚀 Installation

### Prérequis

- **Node.js**: Version 18 ou supérieure
- **yt-dlp**: Requis pour le téléchargement audio/vidéo (installé automatiquement ou via gestionnaire de paquets)
- **FFmpeg**: Requis pour l'intégration des métadonnées et la conversion de format.

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/thesenegalesehitch/music-downloader.git
cd music-downloader

# Installer les dépendances
npm install

# Installer yt-dlp (si non installé)
brew install yt-dlp   # macOS
sudo apt install yt-dlp  # Linux
choco install yt-dlp    # Windows
```

## ⚡ Démarrage Rapide

### Interface Web (Recommandé)

La méthode la plus simple pour utiliser Music Downloader.

1.  Démarrer le serveur web :
    ```bash
    npm run start:web
    ```
2.  Ouvrez votre navigateur à l'adresse `http://localhost:3000`.
3.  **Rechercher & Télécharger**: Entrez un nom de chanson ou une URL (Spotify/Apple Music/Deezer) dans l'onglet "Musique".
4.  **Bibliothèque**: Allez dans l'onglet "Bibliothèque" pour voir et écouter vos morceaux téléchargés.
5.  **Vidéo**: Utilisez l'onglet "Vidéo" pour télécharger des vidéos YouTube.

### Interface en Ligne de Commande (CLI)

Pour l'automatisation ou les téléchargements rapides.

```bash
# Télécharger une piste unique
node cli.js "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"

# Télécharger un album
node cli.js "https://music.apple.com/us/album/album-name/id1234567890"

# Mode interactif
node cli.js --interactive
```

## 🌐 Fonctionnalités de l'Interface Web

- **Recherche Unifiée**: Trouvez de la musique par titre, artiste ou URL directe.
- **Choix du Format**: Sélectionnez entre MP3, FLAC, M4A, etc.
- **Contrôle de Qualité**: Choisissez le bitrate (128kbps, 192kbps, 320kbps).
- **Gestion de Bibliothèque**: Visualisez tous les fichiers, jouez-les et vérifiez les métadonnées.
- **Lecteur Audio Avancé**:
    - Play/Pause, Suivant/Précédent, Recherche.
    - Contrôle du volume.
    - **Visualiseur**: Voyez la musique s'animer.
    - **Paroles Synchro**: Chantez avec les paroles défilantes.
    - **Mode Shuffle & Répétition**.

## 📖 Options de la Ligne de Commande

Le CLI supporte de nombreuses options pour personnaliser vos téléchargements :

- `--help`: Afficher l'aide.
- `--interactive`: Lancer le mode interactif.
- `--bitrate <n>`: Définir le bitrate audio (ex: 320).
- `--format <fmt>`: Définir le format de sortie (mp3, m4a, flac).
- `--cover`: Télécharger uniquement la pochette.
- `--lyrics`: Télécharger uniquement les paroles.

## 🛠 Configuration

Le fichier `conf.json` (créé au premier lancement) permet de configurer :

- Dossier de téléchargement par défaut.
- Clés API (si nécessaire pour certaines fonctionnalités avancées).
- Préférences de nommage des fichiers.

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

1.  Forkez le projet.
2.  Créez votre branche (`git checkout -b feature/AmazingFeature`).
3.  Commitez vos changements (`git commit -m 'Add some AmazingFeature'`).
4.  Push vers la branche (`git push origin feature/AmazingFeature`).
5.  Ouvrez une Pull Request.

## 📄 Licence

Distribué sous la licence Apache 2.0. Voir `LICENSE` pour plus d'informations.
