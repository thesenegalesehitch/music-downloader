/**
 * Lyrics Utilities for Freyr-JS
 * 
 * This module provides utilities for converting and formatting lyrics
 * from Apple Music's TTML format to various synced formats.
 * 
 * Supported Formats:
 * - LRC: Standard synced lyrics format with timestamped lines
 * - SRT: SubRip subtitle format with more accurate timing
 * - TTML: Native Apple Music format (preserved as-is)
 * - Plain: Unsynced lyrics text
 */

import { parse as parseTTML } from 'node-html-parser';

/**
 * Converts Apple Music TTML lyrics to LRC format
 * 
 * LRC format: [mm:ss.xx]lyric line
 * where mm is minutes, ss is seconds, and xx is hundredths of a second
 * 
 * @param {string} ttml - TTML formatted lyrics from Apple Music
 * @param {Object} options - Conversion options
 * @param {boolean} options.enhancedTiming - Use enhanced timing (rounds to nearest 10ms)
 * @returns {string} LRC formatted lyrics
 */
export function convertTTMLtoLRC(ttml, options = {}) {
  const { enhancedTiming = true } = options;
  
  const lines = parseTTML(ttml).querySelectorAll('p');
  const lrcLines = [];
  
  for (const p of lines) {
    const begin = p.getAttribute('begin');
    const text = p.textContent?.trim();
    
    if (!begin || !text) continue;
    
    const timestamp = parseTTMLTimestamp(begin);
    const ms = timestamp.getMilliseconds();
    
    let adjustedMs = ms;
    // Enhanced timing: round to nearest 10ms as per GAMDL
    if (enhancedTiming && ms > 0) {
      const lastDigit = ms % 10;
      if (lastDigit >= 5) {
        adjustedMs = ms + (10 - lastDigit);
      } else {
        adjustedMs = ms - lastDigit;
      }
    }
    
    const totalMs = timestamp.getSeconds() * 1000 + timestamp.getMinutes() * 60 * 1000 + adjustedMs;
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const hundredths = Math.floor((totalMs % 1000) / 10);
    
    lrcLines.push(`[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]${text}`);
  }
  
  return lrcLines.join('\n') + '\n';
}

/**
 * Converts Apple Music TTML lyrics to SRT format
 * 
 * SRT format:
 * 1
 * 00:00:00,000 --> 00:00:00,000
 * lyric line
 * 
 * @param {string} ttml - TTML formatted lyrics from Apple Music
 * @returns {string} SRT formatted lyrics
 */
export function convertTTMLtoSRT(ttml) {
  const lines = parseTTML(ttml).querySelectorAll('p');
  const srtLines = [];
  let index = 1;
  
  for (const p of lines) {
    const begin = p.getAttribute('begin');
    const end = p.getAttribute('end');
    const text = p.textContent?.trim();
    
    if (!begin || !text) continue;
    
    const beginTime = parseTTMLTimestamp(begin);
    const endTime = end ? parseTTMLTimestamp(end) : new Date(beginTime.getTime() + 3000);
    
    srtLines.push(`${index}`);
    srtLines.push(`${formatSRTTime(beginTime)} --> ${formatSRTTime(endTime)}`);
    srtLines.push(text);
    srtLines.push('');
    
    index++;
  }
  
  return srtLines.join('\n');
}

/**
 * Extracts both synced and unsynced lyrics from TTML
 * 
 * @param {string} ttml - TTML formatted lyrics from Apple Music
 * @returns {Object} Object with synced and unsynced lyrics
 */
export function extractLyricsFromTTML(ttml) {
  const lines = parseTTML(ttml).querySelectorAll('p');
  const syncedLyrics = [];
  const unsyncedLyrics = [];
  const unsyncedStanzas = [];
  
  for (const p of lines) {
    const begin = p.getAttribute('begin');
    const text = p.textContent?.trim();
    
    if (!text) continue;
    
    if (begin) {
      syncedLyrics.push({ timestamp: begin, text });
    }
    
    // Build unsynced lyrics by stanza
    unsyncedStanzas.push(text);
  }
  
  // Group unsynced lyrics by stanzas (separated by empty lines in original)
  const unsyncedText = unsyncedStanzas.join('\n\n');
  
  return {
    synced: syncedLyrics,
    unsynced: unsyncedText || null,
    ttml: ttml,
  };
}

/**
 * Parses TTML timestamp to Date object
 * 
 * TTML timestamp formats:
 * - mm:ss.ms (e.g., "01:23.456")
 * - hh:mm:ss.ms (e.g., "01:02:03.456")
 * - frames (e.g., "75")
 * 
 * @param {string} timestamp - TTML timestamp
 * @returns {Date} Parsed date object
 */
export function parseTTMLTimestamp(timestamp) {
  // Handle frame-based timestamps
  if (/^\d+$/.test(timestamp)) {
    const frames = parseInt(timestamp, 10);
    const totalMs = (frames / 25) * 1000; // Assume 25fps
    return new Date(totalMs);
  }
  
  // Handle time-based timestamps
  const parts = timestamp.split(':');
  let ms = 0, secs = 0, mins = 0, hours = 0;
  
  if (parts.length === 1) {
    // Only seconds and milliseconds
    secs = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    // Minutes:Seconds.milliseconds
    mins = parseInt(parts[0], 10);
    secs = parseFloat(parts[1]);
  } else if (parts.length === 3) {
    // Hours:Minutes:Seconds.milliseconds
    hours = parseInt(parts[0], 10);
    mins = parseInt(parts[1], 10);
    secs = parseFloat(parts[2]);
  }
  
  const totalMs = (hours * 3600 + mins * 60 + secs) * 1000;
  return new Date(totalMs);
}

/**
 * Formats Date to SRT time format (HH:MM:SS,mmm)
 * 
 * @param {Date} date - Date object to format
 * @returns {string} Formatted SRT timestamp
 */
function formatSRTTime(date) {
  const hours = date.getUTCHours();
  const mins = date.getUTCMinutes();
  const secs = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Creates a standalone LRC file content with metadata header
 * 
 * @param {Object} params - Parameters for LRC file
 * @param {string} params.title - Track title
 * @param {string} params.artist - Artist name
 * @param {string} params.album - Album name
 * @param {string} params.lyrics - LRC formatted lyrics
 * @returns {string} Complete LRC file content
 */
export function createLRCFile({ title, artist, album, lyrics }) {
  const lines = [
    `[ti:${title}]`,
    `[ar:${artist}]`,
    `[al:${album}]`,
    '',
    lyrics,
  ];
  
  return lines.join('\n');
}

/**
 * Creates a standalone SRT file content
 * 
 * @param {string} lyrics - SRT formatted lyrics
 * @returns {string} Complete SRT file content
 */
export function createSRTFile(lyrics) {
  return lyrics;
}

export default {
  convertTTMLtoLRC,
  convertTTMLtoSRT,
  extractLyricsFromTTML,
  parseTTMLTimestamp,
  createLRCFile,
  createSRTFile,
};
