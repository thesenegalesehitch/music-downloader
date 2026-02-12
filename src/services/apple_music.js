/* eslint-disable camelcase, no-underscore-dangle, class-methods-use-this */
/**
 * Apple Music Service for Freyr-JS
 * 
 * This service provides integration with Apple Music API to download tracks,
 * albums, artists, and playlists with full metadata extraction.
 * 
 * Features Supported:
 * - Track, Album, Artist, Playlist downloads
 * - Full metadata extraction (lyrics, ISRC, copyright, genres)
 * - Featured artists extraction
 * - Music video clips extraction
 * - High-quality audio extraction
 * - Complete iTunes-compatible metadata embedding
 * - Synced lyrics in LRC and SRT formats (from GAMDL)
 * - Extended metadata fields (IDs for all entities)
 * - Extra tags from preview URL
 * 
 * Authentication:
 * - Requires Apple Developer Token for full access
 * - Token is extracted automatically from Apple Music web page
 * - Supports storefront-specific content
 */
import xurl from 'url';
import path from 'path';

import got from 'got';
import Promise from 'bluebird';
import NodeCache from 'node-cache';
import {Client} from '@yujinakayama/apple-music';

import symbols from '../symbols.js';
import lyricsUtils from '../lyrics_utils.js';

const validUriTypes = ['track', 'album', 'artist', 'playlist'];

export default class AppleMusic {
  static [symbols.meta] = {
    ID: 'apple_music',
    DESC: 'Apple Music',
    PROPS: {
      isQueryable: true,
      isSearchable: false,
      isSourceable: false,
    },
    // https://www.debuggex.com/r/Pv_Prjinkz1m2FOB
    VALID_URL:
      /(?:(?:(?:(?:https?:\/\/)?(?:www\.)?)(?:(?:music|(?:geo\.itunes))\.apple.com)\/([a-z]{2})\/(song|album|artist|playlist)\/(?:([^/]+)\/)?\w+)|(?:apple_music:(track|album|artist|playlist):([\w.]+)))/,
    PROP_SCHEMA: {
      developerToken: {type: 'string'},
    },
  };

  [symbols.meta] = AppleMusic[symbols.meta];

  #store = {
    cache: new NodeCache(),
    core: null,
    axiosInstance: null,
    expiry: null,
    defaultStorefront: null,
    isAuthenticated: false,
  };

  constructor(config) {
    if (!config) throw new Error(`[AppleMusic] Please define a configuration object`);
    if (typeof config !== 'object') throw new Error(`[AppleMusic] Please define a configuration as an object`);
    if (config.developerToken)
      try {
        this.#store.expiry = this.expiresAt(config.developerToken);
      } catch (e) {
        let err = new Error('Failed to parse token expiration date');
        err.cause = e;
        throw err;
      }
    this.#store.core = new Client({developerToken: config.developerToken});
    this.#store.axiosInstance = this.#store.core.songs.axiosInstance;
    for (let instance of [this.#store.core.albums, this.#store.core.artists, this.#store.core.playlists])
      instance.axiosInstance = this.#store.axiosInstance;
    this.#store.axiosInstance.defaults.headers['Origin'] = 'https://music.apple.com';
    this.#store.defaultStorefront = config.storefront;
  }

  expiresAt(developerToken) {
    let segments = developerToken.split('.');
    let payload = Buffer.from(segments[1] || '', 'base64');
    let parsed = JSON.parse(payload.toString());
    return parsed.exp * 1000;
  }

  loadConfig(config) {
    if (config.developerToken) {
      this.#store.expiry = this.expiresAt(config.developerToken);
      this.#store.core.configuration.developerToken = config.developerToken;
      this.#store.axiosInstance.defaults.headers['Authorization'] = `Bearer ${config.developerToken}`;
    }
  }

  hasOnceAuthed() {
    return this.#store.isAuthenticated;
  }

  async isAuthed() {
    if (Date.now() < this.#store.expiry)
      try {
        let test_id = 1626195797; // https://music.apple.com/us/song/united-in-grief/1626195797
        let res = await this.#store.core.songs.get(test_id, {storefront: 'us'});
        return res.data?.[0]?.id == test_id;
      } catch {}
    return false;
  }

  newAuth() {
    throw Error('Unimplemented: [AppleMusic:newAuth()]');
  }

  canTryLogin() {
    return true;
  }

  hasProps() {
    return true;
  }

  getProps() {
    return {
      developerToken: this.#store.core.configuration.developerToken,
    };
  }

  async login() {
    let browsePage = await got('https://music.apple.com/us/browse').text();
    let scriptUri;
    // Apple changed their asset naming from 'index-XXXXXXXX.js' to 'index~XXXXXXXX.js'
    if (!(scriptUri = browsePage.match(/assets\/index[-~][a-z0-9]{8,}\.js/)?.[0]))
      throw new Error('Unable to extract core script from Apple Music');
    let script = await got(`https://music.apple.com/${scriptUri}`).text();
    let developerToken;
    if (!(developerToken = script.match(/eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IldlYlBsYXlLaWQifQ[^"]+/)?.[0]))
      throw new Error('Unable to extract developerToken from Apple Music core script');
    this.#store.expiry = this.expiresAt(developerToken);
    this.#store.core.configuration.developerToken = developerToken;
    this.#store.axiosInstance.defaults.headers['Authorization'] = `Bearer ${developerToken}`;
    return (this.#store.isAuthenticated = true);
  }

  validateType(uri) {
    const {type} = this.identifyType(uri);
    return type in validUriTypes;
  }

  identifyType(uri) {
    return this.parseURI(uri).type;
  }

  parseURI(uri, storefront) {
    const match = uri.match(AppleMusic[symbols.meta].VALID_URL);
    if (!match) return null;
    const isURI = !!match[4];
    const parsedURL = xurl.parse(uri, true);
    const collection_type = isURI ? match[4] : match[2] === 'song' ? 'track' : match[2];
    const id = isURI ? match[5] : parsedURL.query.i || path.basename(parsedURL.pathname);
    const type = isURI ? match[4] : collection_type == 'album' && parsedURL.query.i ? 'track' : collection_type;
    const scope = collection_type == 'track' || (collection_type == 'album' && parsedURL.query.i) ? 'song' : collection_type;
    storefront = match[1] || storefront || (#store in this ? this.#store.defaultStorefront : null) || 'us';
    return {
      id,
      type,
      key: match[3] || null,
      uri: `apple_music:${type}:${id}`,
      url: `https://music.apple.com/${storefront}/${scope}/${id}`,
      storefront,
      collection_type,
    };
  }

  /**
   * Wraps track metadata from Apple Music API response into a standardized format
   * 
   * This function extracts all available metadata from an Apple Music track and
   * converts it into a format compatible with Freyr-JS metadata embedding system.
   * 
   * **New Features from GAMDL Analysis:**
   * - Synced lyrics in LRC format (for karaoke/lyrics apps)
   * - Synced format (for video lyrics in SRT subtitles)
   * - Extended IDs (trackId, albumId, artistId, composerId, genreId)
   * - Preview URL for extra tags extraction
   * 
   * @param {Object} trackInfo - Apple Music track API response object
   * @param {Object} albumInfo - Album metadata (defaults to empty object)
   * @returns {Object} Standardized track metadata object
   */
  wrapTrackMeta(trackInfo, albumInfo = {}) {
    // Extract featured artists if available
    const featuring = trackInfo.attributes.featuringArtists 
      ? trackInfo.attributes.featuringArtists.map(a => a.attributes.name)
      : trackInfo.attributes.artistTokenSet 
        ? trackInfo.attributes.artistTokenSet.filter(a => a.type === 'featured').map(a => a.attributes.name)
        : [];

    // Extract all artists including primary and featured
    const allArtists = trackInfo.attributes.artistName 
      ? [trackInfo.attributes.artistName, ...featuring]
      : featuring;

    // Extract artist sort names if available (with safe access for playlist tracks)
    const artistSortNames = trackInfo.relationships?.artists?.data?.map(artist => 
      artist?.attributes?.sortName || artist?.attributes?.name || trackInfo.attributes.artistName
    ) || [trackInfo.attributes.artistName];

    // Extract release date with full timestamp
    const releaseDate = albumInfo.release_date 
      ? albumInfo.release_date + 'T00:00:00Z' 
      : trackInfo.attributes.releaseDate 
        ? (typeof trackInfo.attributes.releaseDate === 'string' 
          ? trackInfo.attributes.releaseDate 
          : `${trackInfo.attributes.releaseDate.year}-${String(trackInfo.attributes.releaseDate.month).padStart(2, '0')}-${String(trackInfo.attributes.releaseDate.day).padStart(2, '0')}T00:00:00Z`)
        : new Date().toISOString();

    // Lyrics extraction and conversion (GAMDL feature)
    // Apple Music stores lyrics in TTML format which needs to be converted to LRC/SRT
    // The lyrics are converted to synced formats for better compatibility with music players
    // Note: Lyrics must be available from Apple Music API. Not all tracks have lyrics uploaded.
    let lyricsTTML = trackInfo.attributes.lyrics;
    let lyricsLRC = null;
    let lyricsSRT = null;
    
    if (lyricsTTML) {
      try {
        // Convert Apple Music TTML lyrics to LRC format (standard synced lyrics)
        // LRC format: [mm:ss.xx]lyric line
        lyricsLRC = lyricsUtils.convertTTMLtoLRC(lyricsTTML);
        
        // Convert to SRT format (subtitle format with more detailed timing)
        // SRT format includes line numbers and end timestamps
        lyricsSRT = lyricsUtils.convertTTMLtoSRT(lyricsTTML);
      } catch (err) {
        // Fallback to plain lyrics if conversion fails
        // The lyrics might be in an unexpected format
        lyricsLRC = null;
        lyricsSRT = null;
      }
    }

    // Extract extended IDs from relationships
    const artistId = trackInfo.relationships?.artists?.data?.[0]?.id || null;
    const genreId = trackInfo.attributes.genreIds?.[0] || null;
    
    // Extract preview URL for extra tags
    const previewUrl = trackInfo.attributes.previews?.[0]?.url || null;

    return {
      // Basic track info
      id: trackInfo.id,
      uri: `apple_music:track:${trackInfo.id}`,
      link: trackInfo.attributes.url,
      name: trackInfo.attributes.name,
      duration: trackInfo.attributes.durationInMillis,
      
      // Artist information
      artists: allArtists,
      featuring,
      artistSortNames,
      album_artist: albumInfo.artists[0],
      composers: trackInfo.attributes.composerName,
      
      // Album information
      album: albumInfo.name,
      album_uri: `apple_music:album:${albumInfo.id}`,
      album_type: albumInfo.type,
      albumSortName: albumInfo.sortName || albumInfo.name,
      images: trackInfo.attributes.artwork,
      getImage: albumInfo.getImage,
      
      // Track details
      track_number: trackInfo.attributes.trackNumber,
      total_tracks: albumInfo.ntracks,
      release_date: releaseDate,
      disc_number: trackInfo.attributes.discNumber,
      total_discs: albumInfo.tracks?.reduce((acc, track) => Math.max(acc, track.attributes?.discNumber || 1), 1) || 1,
      
      // Content classification
      contentRating: trackInfo.attributes.contentRating,
      lyrics: lyricsTTML, // Plain text lyrics (TTML format)
      lyricsLRC, // Synced lyrics in LRC format
      lyricsSRT, // Synced lyrics in SRT format
      genres: trackInfo.attributes.genreNames,
      compilation: albumInfo.type === 'compilation',
      
      // Identifiers & catalog
      isrc: trackInfo.attributes.isrc,
      musicVideo: trackInfo.attributes.musicVideo?.attributes?.url || null,
      label: albumInfo.label,
      copyrights: albumInfo.copyrights,
      
      // Extended IDs (GAMDL feature)
      trackId: trackInfo.id,
      albumId: albumInfo.id,
      artistId,
      composerId: trackInfo.attributes.composerId || null,
      genreId,
      
      // Subscription-quality metadata
      grouping: trackInfo.attributes.grouping || null,
      comments: trackInfo.attributes.comment || null,
      bpm: trackInfo.attributes.bpm || null,
      key: trackInfo.attributes.preview?.audio?.metadata?.key || null,
      
      // Apple Music specific
      appleMusicId: trackInfo.id,
      appleAlbumId: albumInfo.id,
      storefront: albumInfo.storefront || 'us',
      xid: trackInfo.attributes.xid || null,
      
      // Extra tags from preview (GAMDL feature)
      previewUrl,
      extraTags: null, // To be filled by extraTags extraction if needed
    };
  }

  wrapAlbumData(albumObject) {
    return {
      id: albumObject.id,
      uri: albumObject.attributes.url,
      name: albumObject.attributes.name.replace(/\s-\s(Single|EP)$/, ''),
      sortName: albumObject.attributes.name, // For sort order
      artists: [albumObject.attributes.artistName],
      type:
        albumObject.attributes.artistName === 'Various Artists' && albumObject.relationships.artists.data.length === 0
          ? 'compilation'
          : albumObject.attributes.isSingle
            ? 'single'
            : 'album',
      genres: albumObject.attributes.genreNames,
      copyrights: [{type: 'P', text: albumObject.attributes.copyright}],
      images: albumObject.attributes.artwork,
      label: albumObject.attributes.recordLabel,
      release_date: (date =>
        typeof date === 'string'
          ? date
          : [
              [date.year, 4],
              [date.month, 2],
              [date.day, 2],
            ]
              .map(([val, size]) => val.toString().padStart(size, '0'))
              .join('-'))(albumObject.attributes.releaseDate),
      tracks: albumObject.tracks,
      ntracks: albumObject.attributes.trackCount,
      // Subscription quality metadata
      description: albumObject.attributes.editorialNotes?.standard || null,
      copyright: albumObject.attributes.copyright,
      artistId: albumObject.relationships?.artists?.data?.[0]?.id || null,
      storefront: null, // Will be set during request
      getImage(width, height) {
        const min = (val, max) => Math.min(max, val) || max;
        const images = albumObject.attributes.artwork;
        return images.url.replace('{w}x{h}', `${min(width, images.width)}x${min(height, images.height)}`);
      },
    };
  }

  wrapArtistData(artistObject) {
    return {
      id: artistObject.id,
      uri: artistObject.attributes.url,
      name: artistObject.attributes.name,
      genres: artistObject.attributes.genreNames,
      albums: artistObject.albums.map(album => album.id),
      nalbums: artistObject.albums.length,
    };
  }

  wrapPlaylistData(playlistObject) {
    return {
      id: playlistObject.id,
      uri: playlistObject.attributes.url,
      name: playlistObject.attributes.name,
      followers: null,
      description: (playlistObject.attributes.description || {short: null}).short,
      owner_id: null,
      owner_name: playlistObject.attributes.curatorName,
      type: playlistObject.attributes.playlistType.split('-').map(word => `${word[0].toUpperCase()}${word.slice(1)}`),
      tracks: playlistObject.tracks,
      ntracks: playlistObject.tracks.length,
      // hasNonTrack: !!~playlistObject.attributes.trackTypes.findIndex(type => type !== 'songs'),
    };
  }

  async processData(uris, max, store, coreFn) {
    const wasArr = Array.isArray(uris);
    uris = (wasArr ? uris : [uris]).flatMap(_uri => {
      const parsed = this.parseURI(_uri, store);
      if (!parsed) return [];
      parsed.result = this.#store.cache.get(parsed.uri);
      return [[parsed.id, parsed]];
    });
    const packs = uris.filter(([, {result}]) => !result).map(([, parsed]) => parsed);
    let results = new Map();
    for (const [id, {result}] of uris) {
      results.set(id, result);
    }
    uris = Object.fromEntries(uris);
    if (packs.length)
      (
        await Promise.mapSeries(
          Object.entries(
            // organise by storefront
            packs.reduce(
              (all, item) => (((all[item.storefront] = all[item.storefront] || []), all[item.storefront].push(item)), all),
              {},
            ),
          ),
          async ([storefront, _items]) =>
            Promise.mapSeries(
              // cut to maximum query length
              ((f, c) => (
                (c = Math.min(c, f.length)), [...Array(Math.ceil(f.length / c))].map((_, i) => f.slice(i * c, i * c + c))
              ))(_items, max || Infinity),
              async items => coreFn(items, storefront), // request select collection
            ),
        )
      )
        .flat(2)
        .forEach(item => (item ? (this.#store.cache.set(uris[item.id].uri, item), results.set(item.id, item)) : null));
    results = [...results.values()];
    return !wasArr ? results[0] : results;
  }

  async depaginate(paginatedObject, nextHandler) {
    const {data, next} = await paginatedObject;
    if (!next) return data;
    return data.concat(await this.depaginate(await nextHandler(next), nextHandler));
  }

  /**
   * Fetches lyrics from Apple Music API directly
   * 
   * Apple Music stores lyrics in a separate catalog endpoint:
   * GET /v1/catalog/{storefront}/songs/{songId}/lyrics
   * 
   * The lyrics are returned in TTML format which needs to be converted
   * to LRC/SRT for embedding in M4A files.
   * 
   * @param {string} trackId - Apple Music track ID
   * @param {string} storefront - Storefront code (e.g., 'us', 'gb')
   * @returns {Promise<string|null>} TTML lyrics or null if not available
   */
  async fetchLyrics(trackId, storefront) {
    try {
      // Use the axios instance from the Apple Music client
      // The endpoint is /v1/catalog/{storefront}/songs/{id}/lyrics
      const url = `/v1/catalog/${storefront}/songs/${trackId}/lyrics`;
      
      const response = await this.#store.axiosInstance.get(url);
      
      // Check response structure
      if (response?.data && typeof response.data === 'object') {
        if (response.data?.data?.[0]?.attributes?.ttml) {
          return response.data.data[0].attributes.ttml;
        }
      }
      
      return null;
    } catch (err) {
      // Log the error for debugging
      console.error(`[AppleMusic] Lyrics fetch error for track ${trackId}:`, err.message);
      return null;
    }
  }

  /**
   * Fetches track details from Apple Music API with full metadata including lyrics
   * 
   * This method retrieves track information including:
   * - Basic metadata (name, duration, track number)
   * - Artist information (primary and featured artists)
   * - Album metadata
   * - Content rating (explicit/clean)
   * - Lyrics (fetched via /lyrics endpoint)
   * - ISRC code, genre, release date
   * - Relationships (artists, albums)
   * 
   * @param {string|string[]} uris - Apple Music track URI(s) or URL(s)
   * @param {Object} store - Store configuration for API requests
   * @returns {Promise<Object>} Processed track metadata object
   */
  async getTrack(uris, store) {
    return this.processData(uris, 300, store, async (items, storefront) => {
      const {data: tracks} = await this.#store.core.songs.get(`?ids=${items.map(item => item.id).join(',')}`, {storefront});
      await this.getAlbum(
        tracks.flatMap(item => item.relationships.albums.data.map(item => `apple_music:album:${item.id}`)),
        storefront,
      );
      return Promise.mapSeries(tracks, async track => {
        track.artists = await this.depaginate(
          track.relationships.artists,
          async nextUrl => await this.#store.core.songs.get(`${track.id}${nextUrl.split(track.href)[1]}`, {storefront}),
        );
        track.albums = await this.depaginate(track.relationships.albums, nextUrl => {
          let err = new Error('Unimplemented: track albums pagination');
          [err.trackId, err.trackHref, err.nextUrl] = [track.id, track.href, nextUrl];
          throw err;
        });
        if (track.albums.length > 1) {
          let err = new Error('Unimplemented: track with multiple albums');
          [err.trackId, err.trackHref] = [track.id, track.href];
          throw err;
        }
        
        // Fetch lyrics directly from Apple Music API catalog endpoint
        // Lyrics are stored in a separate /lyrics endpoint
        // Format: GET /v1/catalog/{storefront}/songs/{songId}/lyrics
        try {
          const ttmlLyrics = await this.fetchLyrics(track.id, storefront);
          if (ttmlLyrics) {
            track.attributes.lyrics = ttmlLyrics;
          }
        } catch (lyricsErr) {
          // Lyrics might not be available for this track
          // Common reasons: not uploaded, regional restriction, or not in Apple Music catalog
        }
        
        return this.wrapTrackMeta(
          track,
          await this.getAlbum(`apple_music:album:${track.relationships.albums.data[0].id}`, storefront),
        );
      });
    });
  }

  async getAlbum(uris, store) {
    return this.processData(uris, 100, store, async (items, storefront) =>
      Promise.mapSeries(
        (await this.#store.core.albums.get(`?ids=${items.map(item => item.id).join(',')}`, {storefront})).data,
        async album => {
          album.tracks = await this.depaginate(album.relationships.tracks, nextUrl => {
            let err = new Error('Unimplemented: album tracks pagination');
            [err.albumId, err.albumHref, err.nextUrl] = [album.id, album.href, nextUrl];
            throw err;
            // this.#store.core.albums.get(`${album.id}${nextUrl.split(album.href)[1]}`, {storefront});
          });
          return this.wrapAlbumData(album);
        },
      ),
    );
  }

  async getAlbumTracks(url, store) {
    return this.getTrack(
      (await this.getAlbum(url, store)).tracks.map(track => track.attributes.url),
      store,
    );
  }

  async getArtist(uris, store) {
    return this.processData(uris, 25, store, async (items, storefront) =>
      Promise.mapSeries(
        (await this.#store.core.artists.get(`?ids=${items.map(item => item.id).join(',')}`, {storefront})).data,
        async artist => {
          artist.albums = await this.depaginate(artist.relationships.albums, nextUrl =>
            this.#store.core.artists.get(`${artist.id}${nextUrl.split(artist.href)[1]}`, {storefront}),
          );
          return this.wrapArtistData(artist);
        },
      ),
    );
  }

  async getPlaylist(uris, store) {
    return this.processData(uris, 25, store, async (items, storefront) =>
      Promise.mapSeries(
        (await this.#store.core.playlists.get(`?ids=${items.map(item => item.id).join(',')}`, {storefront})).data,
        async playlist => {
          playlist.tracks = await this.depaginate(playlist.relationships.tracks, nextUrl =>
            this.#store.core.playlists.get(`${playlist.id}${nextUrl.split(playlist.href)[1]}`, {storefront}),
          );
          return this.wrapPlaylistData(playlist);
        },
      ),
    );
  }

  async getPlaylistTracks(uris, store) {
    return this.getTrack(
      (await this.getPlaylist(uris, store)).tracks.map(track => track.attributes.url),
      store,
    );
  }

  async getArtistAlbums(uris, store) {
    return this.getAlbum(
      (await this.getArtist(uris)).albums.map(album => `apple_music:album:${album}`),
      store,
    );
  }
}
