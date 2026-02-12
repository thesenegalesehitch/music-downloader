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
   * Fetch lyrics for a track and merge with existing metadata
   * @param {Object} track - Track metadata object
   * @returns {Promise<Object>} Updated track with lyrics
   */
  static async enrichWithLyrics(track) {
    if (track.lyrics && track.lyrics.length > 0) {
      // Already has lyrics from the service
      return track;
    }

    const { title, name, artists, artist } = track;
    const trackTitle = title || name;
    const trackArtist = typeof artist === 'string' ? artist : (artists && artists[0]?.name) || 'Unknown';

    const { plain, lrc } = await this.fetchLyrics(trackTitle, trackArtist);

    if (lrc || plain) {
      return {
        ...track,
        lyrics: plain,
        lyricsLRC: lrc,
      };
    }

    return track;
  }
}
