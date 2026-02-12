# 🎵 Music Downloader

A powerful multi-platform music downloader that fetches metadata from Spotify, Apple Music, and Deezer, then downloads audio with full ID3v2.4 tags.

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)

## ✨ Features

- **Multi-Platform Support**: Download from Spotify, Apple Music, and Deezer
- **Smart Link Resolution**: Automatically resolves Deezer shortlinks and service URLs
- **Full Metadata**: Extracts and embeds complete track metadata (ID3v2.4)
- **High Quality**: Configurable audio quality up to 320kbps
- **Album Art**: Downloads high-resolution cover art
- **Lyrics**: Saves synchronized lyrics (LRC/SRT formats)
- **Interactive Mode**: User-friendly wizard for easy downloads

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [Interactive Mode](#interactive-mode)
- [Supported Services](#supported-services)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Installation

### Prerequisites

- **Node.js**: Version 18 or higher
- **Python**: Version 3.10+ (required for yt-dlp audio downloads)
- **FFmpeg**: Required for audio encoding

### Setup

```bash
# Clone the repository
git clone https://github.com/thesenegalesehitch/music-downloader.git
cd music-downloader

# Install dependencies
npm install

# Install FFmpeg (macOS)
brew install ffmpeg

# Install FFmpeg (Linux)
sudo apt install ffmpeg

# Install FFmpeg (Windows)
choco install ffmpeg
```

## ⚡ Quick Start

### Download a single track

```bash
# Spotify
node cli.js "spotify:track:4cOdK2wGLETKBW3PvgPWqT"

# Apple Music
node cli.js "https://music.apple.com/us/song/song-name/id1234567890"

# Deezer
node cli.js "https://www.deezer.com/track/123456789"
```

### Download an album

```bash
node cli.js "https://open.spotify.com/album/4aawyAB9vmqN3uQ7Q3wJ2a"
node cli.js "https://music.apple.com/us/album/album-name/id1234567890"
node cli.js "https://www.deezer.com/album/123456789"
```

### Download a playlist

```bash
node cli.js "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
```

## ⚙️ Configuration

Create or edit `conf.json` to customize behavior:

```json
{
  "dirs": {
    "output": "./downloads"
  },
  "audio": {
    "bitrate": 320
  },
  "cover_art": {
    "max_size": 1280,
    "save_cover": true
  },
  "lyrics": {
    "save_lrc": true,
    "save_srt": true
  },
  "metadata": {
    "id3_version": "2.4"
  }
}
```

### Configuration Options

| Section | Option | Description | Default |
|---------|--------|-------------|---------|
| `dirs.output` | string | Download directory | `./downloads` |
| `audio.bitrate` | number | Audio bitrate (kbps) | 320 |
| `cover_art.max_size` | number | Max cover art dimension | 1280 |
| `lyrics.enabled` | boolean | Enable lyrics fetching | true |
| `metadata.id3_version` | string | ID3 tag version | `2.4` |

## 📖 Usage

### Command Line Options

```bash
# Show help
node cli.js --help

# Hide startup banner
node cli.js --no-logo --no-header "URL"

# Quick quality selection
node cli.js --1 "URL"   # 320kbps
node cli.js --2 "URL"   # 256kbps
node cli.js --3 "URL"   # 128kbps

# Interactive mode
node cli.js --interactive
node cli.js -i
```

### Subcommands

```bash
# Get/download music (default)
node cli.js get "spotify:track:ID"

# Convert URLs to URIs
node cli.js urify "https://music.apple.com/..."

# Preview filter patterns
node cli.js filter "pattern..."
```

## 🎮 Interactive Mode

Start the wizard for guided downloads:

```bash
node cli.js --interactive
```

Follow the prompts:
1. Paste your music link
2. Preview content (name, artist, tracks)
3. Choose download directory
4. Select audio quality
5. Confirm and download

### Supported Link Formats

| Service | Track | Album | Playlist |
|---------|-------|-------|----------|
| Spotify | ✅ | ✅ | ✅ |
| Apple Music | ✅ | ✅ | ✅ |
| Deezer | ✅ | ✅ | ✅ |
| Deezer Shortlinks | ✅ | ✅ | ✅ |

## 🎧 Supported Services

### Spotify
- Full track, album, playlist support
- OAuth authentication required
- Rich metadata extraction

### Apple Music
- Full catalog access
- Developer token authentication
- High-quality metadata

### Deezer
- Direct API access (no auth for basic features)
- Shortlink support
- Lyrics, BPM, and gain data

## 📦 Requirements

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18.0.0 | 20.0.0+ |
| Python | 3.10.0 | 3.11.0+ |
| RAM | 512 MB | 1 GB |
| Disk | 1 GB | 5 GB |

### Required Tools

- **FFmpeg** - Audio encoding
- **yt-dlp** - YouTube audio extraction (installed via npm)

### Python 3.10+ Setup

If your system Python is below 3.10:

```bash
# macOS with Homebrew
brew install python@3.11
echo 'export PATH="/opt/homebrew/opt/python@3.11/bin:$PATH"' >> ~/.zshrc

# Linux (Ubuntu/Debian)
sudo apt install python3.11 python3.11-venv

# Windows
winget install Python.Python.3.11
```

## 🔧 API Credentials

### Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application
3. Copy Client ID and Client Secret
4. Add to `conf.json`:

```json
{
  "services": {
    "spotify": {
      "clientId": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET"
    }
  }
}
```

### Apple Music Setup

1. Sign up for [Apple Developer Program](https://developer.apple.com/programs/)
2. Create a MusicKit token
3. Add to `conf.json`:

```json
{
  "services": {
    "apple_music": {
      "developerToken": "YOUR_TOKEN"
    }
  }
}
```

## 📁 Output Structure

```
downloads/
├── Artist Name/
│   ├── Album Name/
│   │   ├── 01 Track Name.m4a
│   │   ├── 02 Track Name.m4a
│   │   └── ...
│   └── Artist Name - Single Name.m4a
└── Artist Name - Track Name.m4a
```

### Filename Template

Customize output format in `conf.json`:

```json
{
  "output": {
    "template": "%artist% - %title%",
    "template_album": "%artist%/%album%/%track% - %title%"
  }
}
```

Available placeholders:
- `%artist%` - Artist name
- `%title%` - Track title
- `%album%` - Album name
- `%track%` - Track number
- `%year%` - Release year

## 📝 Notes

### Known Limitations

- Spotify playlist authentication may vary by region
- yt-dlp requires Python 3.10+
- Some rare tracks may not be available on all platforms

### Troubleshooting

**Python version error:**
```bash
# Check Python version
python3 --version

# If below 3.10, install a newer version
brew install python@3.11
```

**Authentication errors:**
- Verify API credentials in `conf.json`
- Check Spotify developer app settings
- Ensure Apple Music token is valid

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## 👤 Author

**Alexandre Albert Ndour**
- GitHub: [@thesenegalesehitch](https://github.com/thesenegalesehitch)
- Email: aa.ndour5@isepat.edu.sn

## 🙏 Acknowledgments

- [Freyr-JS](https://github.com/miraclx/freyr-js) - Original project inspiration
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Audio download engine
- [spotify-web-api-node](https://github.com/thelinmichael/spotify-web-api-node) - Spotify API client

---

**Note**: This tool is for personal use only. Please respect the terms of service of each streaming platform and only download content you have the right to access.
