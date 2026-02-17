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
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ============================================================================
// Configuration Loading
// ============================================================================
const configPath = path.join(__dirname, 'conf.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('Failed to load conf.json:', e);
    process.exit(1);
}

// Environment overrides for sensitive credentials
config.services = config.services || {};
config.services.spotify = {
    ...(config.services.spotify || {}),
    ...(process.env.SPOTIFY_CLIENT_ID ||
    process.env.SPOTIFY_CLIENT_SECRET ||
    process.env.SPOTIFY_REFRESH_TOKEN
        ? {
              clientId: process.env.SPOTIFY_CLIENT_ID || (config.services.spotify || {}).clientId,
              clientSecret:
                  process.env.SPOTIFY_CLIENT_SECRET || (config.services.spotify || {}).clientSecret,
              refreshToken:
                  process.env.SPOTIFY_REFRESH_TOKEN || (config.services.spotify || {}).refreshToken,
          }
        : {}),
};
config.services.apple_music = {
    ...(config.services.apple_music || {}),
    ...(process.env.APPLE_DEVELOPER_TOKEN
        ? { developerToken: process.env.APPLE_DEVELOPER_TOKEN }
        : {}),
};

// Deezer & Musixmatch env overrides
config.services.deezer = {
    ...(config.services.deezer || {}),
    ...(process.env.DEEZER_ARL ? { arl: process.env.DEEZER_ARL } : {}),
};
config.services.musixmatch = {
    ...(config.services.musixmatch || {}),
    ...(process.env.MUSIXMATCH_API_KEY ? { apiKey: process.env.MUSIXMATCH_API_KEY } : {}),
};

// ============================================================================
// Core Initialization
// ============================================================================
let musicDownloaderCore;
try {
    musicDownloaderCore = new MusicDownloaderCore(config.services, AuthServer, config.server);
    console.log('MusicDownloaderCore initialized successfully');
} catch (err) {
    console.error('Failed to initialize MusicDownloaderCore:', err);
}

// ============================================================================
// Middleware & Static Files
// ============================================================================
app.set('trust proxy', true);
app.use(helmet());
app.use(compression());

// CORS (configurable via env; default to all)
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
app.use(
    cors({
        origin: (origin, cb) => {
            if (!allowedOrigins.length || !origin || allowedOrigins.includes(origin))
                return cb(null, true);
            cb(new Error('Not allowed by CORS'));
        },
        credentials: true,
    })
);

// Basic rate limiting for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Ensure downloads directory exists
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
// Serve downloads directory publicly
app.use('/downloads', express.static(DOWNLOAD_DIR));

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes track metadata for frontend consumption
 * Handles image resolution, fallback values, and data formatting
 */
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
        credits: track.composers
            ? Array.isArray(track.composers)
                ? track.composers.join(', ')
                : track.composers
            : track.producer || 'N/A',
        year: track.release_date ? new Date(track.release_date).getFullYear() : 'N/A',
        genre: Array.isArray(track.genres) ? track.genres.join(', ') : track.genres || 'N/A',
        lyrics: track.lyrics || null,
        duration: track.duration,
    };
};

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * GET /api/metadata
 * Fetches metadata for a given URL (Track, Album, or Playlist)
 * Enriches data with high-res artwork and lyrics where possible
 */
app.get('/api/metadata', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const ServiceClass = musicDownloaderCore.identifyService(url);
        if (!ServiceClass)
            return res.status(400).json({ error: 'Unsupported service or invalid URL' });

        const service = musicDownloaderCore.ENGINES.find(
            (engine) => engine instanceof ServiceClass
        );
        if (!service) return res.status(500).json({ error: 'Service instance not found' });

        if (typeof service.login === 'function') {
            try {
                await service.login();
            } catch (e) {
                console.warn('Login failed:', e.message);
            }
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
                    const albumArtist = firstTrack.artists
                        ? Array.isArray(firstTrack.artists)
                            ? firstTrack.artists[0]
                            : firstTrack.artists
                        : 'Unknown';
                    const albumName = firstTrack.album
                        ? firstTrack.album.name || firstTrack.album
                        : 'Unknown';

                    const highResArt = await ArtworkService.getHighResArtwork(
                        albumArtist,
                        albumName
                    );
                    if (highResArt) {
                        tracks.forEach((track) => {
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
                    await Promise.allSettled(
                        chunk.map(async (track) => {
                            try {
                                const artist = Array.isArray(track.artists)
                                    ? track.artists[0]
                                    : track.artists;
                                const albumName =
                                    track.album && track.album.name
                                        ? track.album.name
                                        : track.album;
                                const highRes = await ArtworkService.getHighResArtwork(
                                    artist,
                                    albumName
                                );
                                if (highRes) {
                                    track.cover_url = highRes;
                                    track.images = [highRes];
                                    if (track.album) track.album.images = [highRes];
                                }
                            } catch (e) {}
                        })
                    );
                }
            } catch (e) {
                console.warn('Playlist artwork enrichment failed:', e.message);
            }
        } else {
            try {
                const result = await service.getTrack(url);
                tracks = Array.isArray(result) ? result : [result];
            } catch (e) {
                console.error('Failed to get track:', e);
                return res.status(500).json({ error: 'Failed to fetch track metadata' });
            }
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
                const artist = Array.isArray(normalized[0].artists)
                    ? normalized[0].artists[0]
                    : normalized[0].artists;
                const albumName =
                    normalized[0].album && normalized[0].album.name
                        ? normalized[0].album.name
                        : normalized[0].album;
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
            tracks: normalized,
        });
    } catch (error) {
        console.error('Metadata error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/lyrics
 * Fetches lyrics on demand for a specific track
 */
app.get('/api/lyrics', async (req, res) => {
    const { title, artist, album, duration } = req.query;
    try {
        const lyrics = await LyricsService.get(title, artist, album, duration);
        res.json(lyrics || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/stream
 * Streams audio from YouTube based on a search query
 * Used for the "Live Stream" feature
 */
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
        const streamProcess = youtubedl.exec(
            video.url,
            {
                output: '-',
                format: 'bestaudio',
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
            },
            {
                stdio: ['ignore', 'pipe', 'ignore'], // pipe stdout to res
            }
        );

        // Set headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Pipe to response
        streamProcess.stdout.pipe(res);

        streamProcess.stdout.on('error', (err) => {
            console.error('[Stream] Pipe error:', err);
            res.end();
        });

        streamProcess.catch((err) => {
            console.error('[Stream] Process error:', err.message);
            if (!res.headersSent) res.status(500).send('Stream failed');
            else res.end();
        });
    } catch (error) {
        console.error('[Stream] Error:', error);
        if (!res.headersSent) res.status(500).send(error.message);
    }
});

/**
 * POST /api/download
 * Triggers a download process via the CLI
 * Supports bulk downloads (Playlists/Albums)
 */
app.post('/api/download', (req, res) => {
    const { urls, quality, format } = req.body; // Expects { urls: string[], quality: string, format: string }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }

    // Create temporary config override
    const tempConfig = { audio: {} };
    if (quality) tempConfig.audio.bitrate = parseInt(quality) || 320;
    if (format) tempConfig.audio.format = format;

    const tempConfigFile = path.join(
        __dirname,
        `temp_config_${Date.now()}_${Math.floor(Math.random() * 1000)}.json`
    );
    fs.writeFileSync(tempConfigFile, JSON.stringify(tempConfig));

    // Create a temporary input file for CLI
    const tempInputFile = path.join(
        __dirname,
        `temp_input_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`
    );
    fs.writeFileSync(tempInputFile, urls.join('\n'));

    console.log(`Starting bulk download (${urls.length} items)`);

    // Spawn CLI process
    const cliProcess = spawn('node', ['cli.js', tempInputFile, '--config', tempConfigFile], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    cliProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    cliProcess.stderr.on('data', (data) => {
        console.error(`CLI Error: ${data}`);
    });

    cliProcess.on('close', (code) => {
        // Cleanup temp files
        try {
            if (fs.existsSync(tempConfigFile)) fs.unlinkSync(tempConfigFile);
            if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
        } catch (e) {
            console.warn('Failed to clean up temp files', e);
        }

        if (code === 0) {
            res.json({ success: true, message: 'Download started/completed', logs: output });
        } else {
            res.status(500).json({ error: 'Download failed', logs: output });
        }
    });
});

/**
 * POST /api/video
 * Downloads a YouTube video
 */
app.post('/api/video', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const timestamp = Date.now();
    // Use a cleaner filename template
    const outputTemplate = path.join(DOWNLOAD_DIR, `video_${timestamp}_%(title)s.%(ext)s`);

    try {
        console.log(`[Video] Downloading: ${url}`);
        await youtubedl(url, {
            output: outputTemplate,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            addMetadata: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
        });

        // Find the generated file
        const files = fs.readdirSync(DOWNLOAD_DIR);
        // Look for the file matching our timestamp pattern
        const videoFile = files.find((f) => f.includes(`video_${timestamp}_`));

        if (videoFile) {
            console.log(`[Video] Download complete: ${videoFile}`);
            res.json({
                success: true,
                downloadUrl: `/downloads/${videoFile}`,
                filename: videoFile,
            });
        } else {
            throw new Error('File not found after download');
        }
    } catch (error) {
        console.error('Video download error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/library
 * Lists all downloaded media files in the downloads directory
 */
app.get('/api/library', async (req, res) => {
    try {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            return res.json({ success: true, files: [] });
        }

        const files = fs.readdirSync(DOWNLOAD_DIR);
        // Filter for audio/video files (m4a, mp3, flac, wav, ogg, mp4, webm, mkv)
        const mediaFiles = files.filter((file) =>
            /\.(m4a|mp3|flac|wav|ogg|mp4|webm|mkv)$/i.test(file)
        );

        // Simple metadata extraction from filename
        const library = mediaFiles.map((file) => {
            const ext = path.extname(file);
            const basename = path.basename(file, ext);
            const isVideo = /\.(mp4|mkv|webm)$/i.test(file);

            // Try to parse "Artist - Title"
            const parts = basename.split(' - ');

            let artist = 'Unknown Artist';
            let title = basename;

            // Basic heuristic for "Artist - Title" format
            if (parts.length >= 2) {
                artist = parts[0];
                title = parts.slice(1).join(' - ');
            }

            // Clean up video filenames if they match our pattern
            if (isVideo && title.startsWith(`video_`)) {
                // Remove "video_timestamp_" prefix
                title = title.replace(/^video_\d+_/, '');
            }

            return {
                filename: file,
                url: `/downloads/${encodeURIComponent(file)}`,
                artist,
                title,
                type: isVideo ? 'video' : 'audio',
                ext: ext.substring(1),
            };
        });

        res.json({ success: true, files: library });
    } catch (error) {
        console.error('Library error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// Start Server
// ============================================================================
app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
