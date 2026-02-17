/**
 * @fileoverview Lyrics service using multiple sources
 * @module services/lyrics
 */

import got from 'got';

export default class LyricsService {
  static [Symbol.toStringTag] = 'LyricsService';

  /**
   * Fetch lyrics from lyrics.ovh API (free, no auth required)
   * @param {string} title - Song title
   * @param {string} artist - Artist name
   * @returns {Promise<{plain: string|null, lrc: string|null}>}
   */
  static async fetchLyrics(title, artist) {
    try {
      // Primary: lyrics.ovh API
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      
      const response = await got(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: { request: 15000 },
      });

      // Parse JSON manually
      const data = JSON.parse(response.body);
      
      if (data && data.lyrics) {
        const plainLyrics = data.lyrics;
        const lrc = this.generateBasicLRC(plainLyrics);
        return { plain: plainLyrics, lrc };
      }

      return { plain: null, lrc: null };
    } catch (err) {
      // Fallback: try with just the title
      if (err.name !== 'HTTPError' && title.length > 3) {
        return this.fetchLyricsByTitle(title);
      }
      console.error(`[Lyrics] Error fetching from lyrics.ovh: ${err.message}`);
      return { plain: null, lrc: null };
    }
  }

  /**
   * Fetch lyrics by title only (fallback)
   * @param {string} title - Song title
   * @returns {Promise<{plain: string|null, lrc: string|null}>}
   */
  static async fetchLyricsByTitle(title) {
    try {
      const url = `https://api.lyrics.ovh/suggest/${encodeURIComponent(title)}`;
      
      const response = await got(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: { request: 15000 },
      });

      const data = JSON.parse(response.body);
      
      if (data && data.data && data.data.length > 0) {
        // Get the first result
        const firstResult = data.data[0];
        const artist = firstResult.artist.name;
        const songTitle = firstResult.title;
        
        // Fetch full lyrics
        return this.fetchLyrics(songTitle, artist);
      }

      return { plain: null, lrc: null };
    } catch (err) {
      console.error(`[Lyrics] Fallback search error: ${err.message}`);
      return { plain: null, lrc: null };
    }
  }

  /**
   * Generate basic LRC format from plain lyrics
   * @param {string} plainLyrics - Plain text lyrics
   * @returns {string|null} LRC formatted lyrics
   */
  static generateBasicLRC(plainLyrics) {
    const lines = plainLyrics.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;

    // Estimate timing based on line count and average line length
    const lrcLines = [];
    let currentTime = 0;
    const avgCharsPerSecond = 15;
    
    for (const line of lines) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}]`;
      lrcLines.push(`${timestamp}${line.trim()}`);
      
      // Estimate next timestamp based on line length
      currentTime += Math.max(2, line.length / avgCharsPerSecond);
    }

    return lrcLines.join('\n');
  }

  /**
   * Fetch lyrics from LRCLIB (free, open source)
   * @param {string} title - Song title
   * @param {string} artist - Artist name
   * @param {string} album - Album name (optional)
   * @param {string} duration - Duration in seconds (optional)
   * @returns {Promise<{plain: string|null, lrc: string|null}>}
   */
  static async fetchFromLrcLib(title, artist, album, duration) {
    try {
      const url = 'https://lrclib.net/api/get';
      const searchParams = {
        artist_name: artist,
        track_name: title,
      };
      if (album) searchParams.album_name = album;
      if (duration) searchParams.duration = Math.round(duration);

      const response = await got(url, {
        searchParams,
        headers: {
          'User-Agent': 'MusicDownloader/1.0.0 (https://github.com/thesenegalesehitch/music-downloader)',
        },
        timeout: { request: 10000 },
      });

      const data = JSON.parse(response.body);

      if (data) {
        return {
          plain: data.plainLyrics || null,
          lrc: data.syncedLyrics || null,
        };
      }
    } catch (err) {
      // Try search endpoint if get fails
      try {
        const searchUrl = 'https://lrclib.net/api/search';
        const searchResponse = await got(searchUrl, {
          searchParams: { q: `${artist} ${title}` },
          headers: {
             'User-Agent': 'MusicDownloader/1.0.0 (https://github.com/thesenegalesehitch/music-downloader)',
          },
          timeout: { request: 10000 },
        });
        
        const searchData = JSON.parse(searchResponse.body);
        if (Array.isArray(searchData) && searchData.length > 0) {
           // Pick the best match (first one usually)
           const bestMatch = searchData[0];
           return {
             plain: bestMatch.plainLyrics || null,
             lrc: bestMatch.syncedLyrics || null,
           };
        }

      } catch (searchErr) {
        console.error(`[Lyrics] Error fetching from LRCLIB: ${searchErr.message}`);
      }
    }
    return { plain: null, lrc: null };
  }

  /**
   * Get lyrics for specific parameters
   * @param {string} title 
   * @param {string} artist 
   * @param {string} album 
   * @param {number} duration 
   */
  static async get(title, artist, album, duration) {
    // Try LRCLIB first
    let lyricsData = await this.fetchFromLrcLib(title, artist, album, duration);
    
    // Fallback to lyrics.ovh
    if (!lyricsData.lrc && !lyricsData.plain) {
        lyricsData = await this.fetchLyrics(title, artist);
    }

    return {
        lyrics: lyricsData.plain,
        lyricsLRC: lyricsData.lrc
    };
  }

  /**
   * Fetch lyrics for a track and merge with existing metadata
   * @param {Object} track - Track metadata object
   * @returns {Promise<Object>} Updated track with lyrics
   */
  static async enrichWithLyrics(track) {
    if (track.lyrics && track.lyrics.length > 0) {
      // Already has lyrics from the service
      return track;
    }

    const { title, name, artists, artist, album, duration } = track;
    const trackTitle = title || name;
    const trackArtist = typeof artist === 'string' ? artist : (artists && artists[0]?.name) || (Array.isArray(artists) ? artists[0] : 'Unknown');
    const trackAlbum = album || null;
    const trackDuration = duration ? duration / 1000 : null; // duration usually in ms

    // Try Primary Source (LRCLIB) for Synced Lyrics
    let lyricsData = await this.fetchFromLrcLib(trackTitle, trackArtist, trackAlbum, trackDuration);

    // If no lyrics found, try Secondary Source (lyrics.ovh)
    if (!lyricsData.plain && !lyricsData.lrc) {
      console.log(`[Lyrics] LRCLIB failed, trying lyrics.ovh for: ${trackTitle} - ${trackArtist}`);
      lyricsData = await this.fetchLyrics(trackTitle, trackArtist);
    }

    if (lyricsData.lrc || lyricsData.plain) {
      return {
        ...track,
        lyrics: lyricsData.plain,
        lyricsLRC: lyricsData.lrc,
      };
    }

    return track;
  }
}
