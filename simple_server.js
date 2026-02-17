import express from 'express';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import MusicDownloaderCore from './src/freyr.js';
import AuthServer from './src/cli_server.js';
import LyricsService from './src/services/lyrics.js';
import ArtworkService from './src/services/artwork.js';
import youtubedl from 'youtube-dl-exec';
import ytSearch from 'yt-search';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Load config
const configPath = path.join(__dirname, 'conf.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('Failed to load conf.json:', e);
  process.exit(1);
}

// Initialize MusicDownloaderCore
let musicDownloaderCore;
try {
  musicDownloaderCore = new MusicDownloaderCore(config.services, AuthServer, config.server);
  console.log('MusicDownloaderCore initialized successfully');
} catch (err) {
  console.error('Failed to initialize MusicDownloaderCore:', err);
}

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure downloads directory exists
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}
// Serve downloads directory
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Helper: Normalize track metadata
const normalizeTrack = (track) => {
    // Resolve image URL
    let cover_url = null;
    if (typeof track.getImage === 'function') {
        cover_url = track.getImage(600, 600);
    } else if (track.images && Array.isArray(track.images) && track.images.length > 0) {
        cover_url = track.images[track.images.length - 1]; // Use largest
    } else if (track.images && typeof track.images === 'string') {
        cover_url = track.images;
    } else if (track.album && track.album.images) {
        if (Array.isArray(track.album.images) && track.album.images.length > 0) {
            cover_url = track.album.images[track.album.images.length - 1];
        } else if (typeof track.album.images === 'string') {
            cover_url = track.album.images;
        }
    }
    
    return {
        ...track,
        url: track.url || track.link,
        cover_url: cover_url || 'https://via.placeholder.com/300?text=No+Cover',
        isrc: track.isrc || 'N/A',
        label: track.label || (track.album ? track.album.label : 'N/A'),
        credits: track.composers ? (Array.isArray(track.composers) ? track.composers.join(', ') : track.composers) : (track.producer || 'N/A'),
        year: track.release_date ? new Date(track.release_date).getFullYear() : 'N/A',
        genre: Array.isArray(track.genres) ? track.genres.join(', ') : (track.genres || 'N/A'),
        lyrics: track.lyrics || null,
        duration: track.duration
    };
};

// API: Get Metadata (Tracks/Albums/Playlists)
app.get('/api/metadata', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const ServiceClass = musicDownloaderCore.identifyService(url);
    if (!ServiceClass) return res.status(400).json({ error: 'Unsupported service or invalid URL' });

    const service = musicDownloaderCore.ENGINES.find(engine => engine instanceof ServiceClass);
    if (!service) return res.status(500).json({ error: 'Service instance not found' });

    if (typeof service.login === 'function') {
      try { await service.login(); } catch (e) { console.warn('Login failed:', e.message); }
    }

    const uriData = MusicDownloaderCore.parseURI(url);
    const type = uriData ? uriData.type : 'track';
    
    let tracks = [];
    if (type === 'album') {
        tracks = await service.getAlbumTracks(url);
        // Enrich Album Artwork (High-Res Fallback) - applied to all tracks
        try {
            // Use the first track's artist and album name
            if (tracks.length > 0) {
                const firstTrack = tracks[0];
                const albumArtist = firstTrack.artists ? (Array.isArray(firstTrack.artists) ? firstTrack.artists[0] : firstTrack.artists) : 'Unknown';
                const albumName = firstTrack.album ? (firstTrack.album.name || firstTrack.album) : 'Unknown';
                
                const highResArt = await ArtworkService.getHighResArtwork(albumArtist, albumName);
                if (highResArt) {
                    tracks.forEach(track => {
                        track.cover_url = highResArt;
                        track.images = [highResArt];
                        if (track.album) track.album.images = [highResArt];
                    });
                }
            }
        } catch (e) {
            console.warn('Album artwork enrichment failed:', e.message);
        }
    } else if (type === 'playlist') {
        tracks = await service.getPlaylistTracks(url);
        // Enrich Playlist Tracks Artwork (Process all tracks in chunks)
        try {
            const chunkSize = 5;
            for (let i = 0; i < tracks.length; i += chunkSize) {
                const chunk = tracks.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map(async (track) => {
                     try {
                         const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists;
                         const albumName = track.album && track.album.name ? track.album.name : track.album;
                         const highRes = await ArtworkService.getHighResArtwork(artist, albumName);
                         if (highRes) {
                             track.cover_url = highRes;
                             track.images = [highRes];
                             if (track.album) track.album.images = [highRes];
                         }
                     } catch (e) {}
                }));
            }
        } catch (e) {
            console.warn('Playlist artwork enrichment failed:', e.message);
        }
    } else {
        const result = await service.getTrack(url);
        tracks = Array.isArray(result) ? result : [result];
    }

    const normalized = tracks.map(normalizeTrack);
    
    // For single track, try to enrich lyrics and artwork immediately for better UX
    if (normalized.length === 1) {
        // Enrich Lyrics
        if (!normalized[0].lyrics) {
            try {
                const enriched = await LyricsService.enrichWithLyrics(normalized[0]);
                normalized[0].lyrics = enriched.lyrics;
                normalized[0].lyricsLRC = enriched.lyricsLRC;
            } catch (e) {}
        }
        // Enrich Artwork (High-Res Fallback)
        try {
            const artist = Array.isArray(normalized[0].artists) ? normalized[0].artists[0] : normalized[0].artists;
            const albumName = normalized[0].album && normalized[0].album.name ? normalized[0].album.name : normalized[0].album;
            const highResArt = await ArtworkService.getHighResArtwork(artist, albumName);
            if (highResArt) {
                normalized[0].cover_url = highResArt;
                normalized[0].images = [highResArt]; // Update internal images array too
            }
        } catch (e) {}
    }

    res.json({
        type,
        count: normalized.length,
        tracks: normalized
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get Lyrics on demand
app.get('/api/lyrics', async (req, res) => {
    const { title, artist, album, duration } = req.query;
    try {
        const lyrics = await LyricsService.get(title, artist, album, duration);
        res.json(lyrics || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Stream Audio (Live)
app.get('/api/stream', async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).send('Query required');

    try {
        console.log(`[Stream] Searching for: ${query}`);
        // 1. Search YouTube
        const searchResults = await ytSearch(query);
        const video = searchResults.videos.length > 0 ? searchResults.videos[0] : null;

        if (!video) {
            return res.status(404).send('Video not found');
        }

        console.log(`[Stream] Found: ${video.title} (${video.videoId})`);
        
        // 2. Stream from YouTube using youtube-dl-exec (piping stdout)
        // We use 'bestaudio' and pipe the output
        const streamProcess = youtubedl.exec(video.url, {
            output: '-',
            format: 'bestaudio',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
        }, {
            stdio: ['ignore', 'pipe', 'ignore'] // pipe stdout to res
        });

        // Set headers
        res.setHeader('Content-Type', 'audio/mpeg'); // or audio/webm depending on source, but browsers handle it
        res.setHeader('Transfer-Encoding', 'chunked');

        // Pipe to response
        streamProcess.stdout.pipe(res);

        streamProcess.stdout.on('error', (err) => {
            console.error('[Stream] Pipe error:', err);
            res.end();
        });
        
        // Handle process promise rejection (e.g. non-zero exit code)
        streamProcess.catch(err => {
             console.error('[Stream] Process error:', err.message);
             if (!res.headersSent) res.status(500).send('Stream failed');
             else res.end();
        });
        
        // Handle process exit?
        // streamProcess.on('close', ...) - express handles res.end() via pipe usually.

    } catch (error) {
        console.error('[Stream] Error:', error);
        if (!res.headersSent) res.status(500).send(error.message);
    }
});

// API: Download Music (Bulk/Single)
app.post('/api/download', (req, res) => {
  const { urls, quality, format } = req.body; // Expects { urls: string[], quality: string, format: string }
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array is required' });
  }

  const tempConfig = { audio: {} };
  if (quality) tempConfig.audio.bitrate = parseInt(quality) || 320;
  if (format) tempConfig.audio.format = format;

  const tempConfigFile = path.join(__dirname, `temp_config_${Date.now()}_${Math.floor(Math.random()*1000)}.json`);
  fs.writeFileSync(tempConfigFile, JSON.stringify(tempConfig));

  // Create a temporary input file for CLI
  const tempInputFile = path.join(__dirname, `temp_input_${Date.now()}_${Math.floor(Math.random()*1000)}.txt`);
  fs.writeFileSync(tempInputFile, urls.join('\n'));

  console.log(`Starting bulk download (${urls.length} items)`);

  const cliProcess = spawn('node', ['cli.js', tempInputFile, '--config', tempConfigFile], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  cliProcess.stdout.on('data', (data) => {
    output += data.toString();
    // Real-time log via SSE could be added here
  });
  
  cliProcess.stderr.on('data', (data) => {
    console.error(`CLI Error: ${data}`);
  });

  cliProcess.on('close', (code) => {
    fs.unlinkSync(tempConfigFile);
    fs.unlinkSync(tempInputFile);
    if (code === 0) {
      // Find the generated file(s) - simplified for now
      res.json({ success: true, message: 'Download started/completed', logs: output });
    } else {
      res.status(500).json({ error: 'Download failed', logs: output });
    }
  });
});

// API: Download Video (YouTube)
app.post('/api/video', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const timestamp = Date.now();
    const outputTemplate = path.join(DOWNLOAD_DIR, `video_${timestamp}_%(title)s.%(ext)s`);

    try {
        // We use youtube-dl-exec to spawn the process
        await youtubedl(url, {
            output: outputTemplate,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            addMetadata: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot']
        });

        // Find the file
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const videoFile = files.find(f => f.startsWith(`video_${timestamp}_`));
        
        if (videoFile) {
            res.json({ 
                success: true, 
                downloadUrl: `/downloads/${videoFile}`,
                filename: videoFile
            });
        } else {
            res.status(500).json({ error: 'File not found after download' });
        }
    } catch (error) {
        console.error('Video download error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Stream/Play Local File
// This is handled by static file serving /downloads

// API: Get Library (List Downloaded Files)
app.get('/api/library', async (req, res) => {
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        // Filter for audio/video files (m4a, mp3, flac, wav, ogg, mp4)
        const mediaFiles = files.filter(file => /\.(m4a|mp3|flac|wav|ogg|mp4)$/i.test(file));
        
        // Simple metadata extraction from filename if possible
        const library = mediaFiles.map(file => {
             // Try to parse "Artist - Title.ext"
             const ext = path.extname(file);
             const basename = path.basename(file, ext);
             
             // Check if it's a video file
             const isVideo = /\.(mp4|mkv|webm)$/i.test(file);
             
             // Heuristic: most files from this tool are "Artist - Title" or just Title if from YouTube
             // But CLI usually outputs: "Artist - Title.m4a"
             const parts = basename.split(' - ');
             
             let artist = 'Unknown Artist';
             let title = basename;
             
             if (parts.length >= 2) {
                 artist = parts[0];
                 title = parts.slice(1).join(' - ');
             }
             
             return {
                 filename: file,
                 url: `/downloads/${encodeURIComponent(file)}`,
                 artist,
                 title,
                 type: isVideo ? 'video' : 'audio',
                 ext: ext.substring(1)
             };
        });
        
        res.json({ success: true, files: library });
    } catch (error) {
        console.error('Library error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
