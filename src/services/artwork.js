import got from 'got';

/**
 * Service for fetching high-resolution artwork from alternative sources
 */
export default class ArtworkService {
  /**
   * Search for high-res artwork on iTunes and Deezer
   * @param {string} artist - Artist name
   * @param {string} album - Album name
   * @returns {Promise<string|null>} - URL of high-res artwork or null
   */
  static async getHighResArtwork(artist, album) {
    if (!artist || !album) return null;

    // Try iTunes first (usually best quality/highest resolution up to 3000x3000px)
    try {
      const artwork = await this.searchITunes(artist, album);
      if (artwork) return artwork;
    } catch (e) {
      console.error('[Artwork] iTunes search failed:', e.message);
    }

    // Try Deezer as fallback (usually 1000x1000px)
    try {
      const artwork = await this.searchDeezer(artist, album);
      if (artwork) return artwork;
    } catch (e) {
      console.error('[Artwork] Deezer search failed:', e.message);
    }

    return null;
  }

  static async searchITunes(artist, album) {
    const query = `${artist} ${album}`;
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=1`;
    
    const response = await got(url).json();
    
    if (response.resultCount > 0) {
      const result = response.results[0];
      if (result.artworkUrl100) {
        // Magic replacement for high-res
        return result.artworkUrl100.replace('100x100bb', '3000x3000bb');
      }
    }
    return null;
  }

  static async searchDeezer(artist, album) {
    const query = `artist:"${artist}" album:"${album}"`;
    const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=1`;
    
    const response = await got(url).json();
    
    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      // Prefer cover_xl, then cover_big, etc.
      return result.cover_xl || result.cover_big || result.cover_medium;
    }
    return null;
  }
}
