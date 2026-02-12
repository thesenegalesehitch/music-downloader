# 🎵 Music Downloader

A powerful multi-platform music downloader that fetches metadata from Spotify, Apple Music, and Deezer, then downloads audio with full ID3v2.4 tags.

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18%2B-green.svg)

## ✨ Features

- **Multi-Platform Support**: Download from Spotify, Apple Music, and Deezer
- **Smart Link Resolution**: Automatically resolves Deezer shortlinks and service URLs
- **Full Metadata**: Extracts and embeds complete track metadata (ID3v2.4)
- **High Quality**: Downloads high-quality audio (320kbps equivalent)
- **Album Art**: Downloads high-resolution cover art
- **Lyrics**: Saves synchronized lyrics (LRC format)
- **Easy to Use**: Simple command-line interface with interactive mode

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Interactive Mode](#interactive-mode)
- [Command Line Options](#command-line-options)
- [Configuration](#configuration)
- [Supported Services](#supported-services)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Installation

### Prerequisites

- **Node.js**: Version 18 or higher
- **yt-dlp**: Required for audio downloads (installed automatically)

### Setup

```bash
# Clone the repository
git clone https://github.com/thesenegalesehitch/music-downloader.git
cd music-downloader

# Install dependencies
npm install

# Install yt-dlp (if not already installed)
brew install yt-dlp   # macOS
sudo apt install yt-dlp  # Linux
choco install yt-dlp    # Windows
```

### Quick Launch

After installation, you can run the tool with:

```bash
# Method 1: Direct node execution
node cli.js "URL"

# Method 2: Using npm script
npm start -- "URL"

# Method 3: Interactive mode
npm start:i --

# Method 4: Install globally
npm install -g .
musiquedl "URL"
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

# Deezer shortlinks (automatic resolution)
node cli.js "https://deezer.page-link/abc123"
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

### Download multiple tracks from a file

```bash
# Create a text file with one URL per line
echo "https://open.spotify.com/track/ID1" > tracks.txt
echo "https://open.spotify.com/track/ID2" >> tracks.txt

# Download all tracks
node cli.js --input tracks.txt
```

## 🎮 Interactive Mode

Start the wizard for guided downloads:

```bash
node cli.js --interactive
npm start:i --
```

Follow the prompts:
1. Paste your music link
2. Preview content (name, artist, tracks)
3. Download starts automatically to `./downloads` folder

## 📖 Command Line Options

### Basic Options

```bash
# Show help
node cli.js --help

# Download to current directory
node cli.js "URL"

# Interactive mode
node cli.js --interactive
node cli.js -i

# Download from file (one URL per line)
node cli.js --input tracks.txt
```

### Advanced Options

```bash
# Specify download directory
node cli.js --directory ./my-music "URL"

# Download without album art
node cli.js --no-cover "URL"

# Download lyrics
node cli.js --lyrics "URL"

# Disable playlist auto-creation
node cli.js --no-playlist "URL"
```

### Quality Options

```bash
# 320kbps (highest)
node cli.js --1 "URL"

# 256kbps (high)
node cli.js --2 "URL"

# 192kbps (medium)
node cli.js --3 "URL"

# 128kbps (low)
node cli.js --4 "URL"
```

## ⚙️ Configuration

Create or edit `conf.json` to customize behavior:

```json
{
  "dirs": {
    "output": "./downloads"
  },
  "audio": {
    "quality": "best",
    "bitrate": 320,
    "codec": "auto"
  },
  "cover_art": {
    "enabled": true,
    "max_size": 1280,
    "save_cover": true
  },
  "lyrics": {
    "enabled": true,
    "save_lrc": true,
    "embed_lyrics": true
  },
  "metadata": {
    "enabled": true,
    "id3_version": "2.4"
  },
  "output": {
    "template": "%artist% - %title%",
    "template_album": "%artist%/%album%/%track% - %title%"
  },
  "services": {
    "spotify": {
      "clientId": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET"
    },
    "apple_music": {
      "storefront": "us"
    }
  }
}
```

### Configuration Options

| Section | Option | Description | Default |
|---------|--------|-------------|---------|
| `dirs.output` | string | Download directory | `./downloads` |
| `audio.bitrate` | number | Audio bitrate (kbps) | 320 |
| `audio.quality` | string | Quality setting | `best` |
| `cover_art.enabled` | boolean | Enable cover download | `true` |
| `cover_art.max_size` | number | Max cover dimension | 1280 |
| `lyrics.enabled` | boolean | Enable lyrics fetching | `true` |
| `lyrics.save_lrc` | boolean | Save LRC format | `true` |
| `metadata.id3_version` | string | ID3 tag version | `2.4` |
| `output.template` | string | Single track naming | `%artist% - %title%` |
| `output.template_album` | string | Album track naming | `%artist%/%album%/%track% - %title%` |

### Output Template Variables

Available placeholders for `template` and `template_album`:
- `%artist%` - Artist name
- `%title%` - Track title
- `%album%` - Album name
- `%track%` - Track number (padded)
- `%year%` - Release year

### Supported Link Formats

| Service | Track | Album | Playlist | Shortlink |
|---------|-------|-------|---------|-----------|
| Spotify | ✅ | ✅ | ✅ | - |
| Apple Music | ✅ | ✅ | ✅ | - |
| Deezer | ✅ | ✅ | ✅ | ✅ |

## 🎧 Supported Services

### Spotify
- Full track, album, playlist support
- OAuth authentication required for full access
- Rich metadata extraction
- Get credentials at: https://developer.spotify.com/dashboard

### Apple Music
- Full catalog access
- Developer token authentication
- High-quality metadata and lyrics

### Deezer
- Direct API access (no auth for basic features)
- Shortlink automatic resolution
- Lyrics, BPM, and gain data included

## 📦 Requirements

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18.0.0 | 20.0.0+ |
| RAM | 512 MB | 1 GB |
| Disk | 1 GB | 5 GB |

### Required Tools

- **yt-dlp** - YouTube audio extraction
- **AtomicParsley** - Metadata embedding (M4A)
- **FFmpeg** - Audio encoding

## 📁 Output Structure

Downloads are saved to `./downloads` folder by default:

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

### Additional Files

Alongside each audio file, you may find:
- `.lrc` - Synchronized lyrics
- `.jpg` - Album cover (if saving enabled)

## 🔧 API Credentials (Optional)

### Spotify Setup

For full Spotify functionality, add credentials to `conf.json`:

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

Get credentials at: https://developer.spotify.com/dashboard

### Apple Music Setup (Optional)

```json
{
  "services": {
    "apple_music": {
      "storefront": "us"
    }
  }
}
```

## 📝 Notes

### Known Limitations

- Spotify playlist authentication may vary by region
- Some rare tracks may not be available on all platforms
- yt-dlp requires Python 3.10+ for best compatibility

### Troubleshooting

**yt-dlp not found:**
```bash
# Install yt-dlp
brew install yt-dlp   # macOS
pip install yt-dlp    # Python
```

**Permission errors:**
```bash
# Make sure downloads folder exists
mkdir -p downloads

# Or specify a different directory
node cli.js --directory ~/Music "URL"
```

**Spotify authentication failed:**
- Verify credentials in `conf.json`
- Check Spotify developer app settings
- Ensure redirect URI is configured correctly

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

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Audio download engine
- [AtomicParsley](http://atomicparsley.sourceforge.net/) - Metadata embedding

---

**Note**: This tool is for personal use only. Please respect the terms of service of each streaming platform and only download content you have the right to access.
