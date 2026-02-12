/* eslint-disable camelcase, no-underscore-dangle, class-methods-use-this, max-classes-per-file */
import url from 'url';
import path from 'path';

import got from 'got';
import NodeCache from 'node-cache';

import symbols from '../symbols.js';
import AsyncQueue from '../async_queue.js';

const validUriTypes = ['track', 'album', 'artist', 'playlist'];

class WebapiError extends Error {
  constructor(message, statusCode, status) {
    super(message);
    if (status) this.status = status;
    if (statusCode) this.statusCode = statusCode;
  }
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

export class DeezerCore {
  legacyApiUrl = 'https://api.deezer.com';
  altApiUrl = 'https://www.deezer.com/ajax/gw-light.php';

  requestObject = got.extend({
    responseType: 'json',
    searchParams: {output: 'json'},
  });

  #validatorData = {expires: 0, queries: []};

  #retrySymbol = Symbol('DeezerCoreTrialCount');

  #getIfHasError = response => {
    if (!(response.body && typeof response.body === 'object' && 'error' in response.body)) return null;

    if (Array.isArray(response.body.error)) return response.body.error.length > 0 ? response.body.error[0] : null;

    return response.body.error;
  };

  validatorQueue = new AsyncQueue('validatorQueue', 1, async now => {
    if (this.#validatorData.queries.length === 50)
      await sleep(this.#validatorData.expires - Date.now()).then(() => Promise.all(this.#validatorData.queries));
    if (this.#validatorData.expires <= (now = Date.now())) this.#validatorData = {expires: now + 5000, queries: []};
    return new Promise(res => this.#validatorData.queries.push(new Promise(res_ => res(res_))));
  });

  #sendRequest = async (ref, opts, retries) => {
    retries = typeof retries === 'object' ? retries : {prior: 0, remaining: retries};
    const ticketFree = await this.validatorQueue[retries.prior === 0 ? 'push' : 'unshift']();
    return this.requestObject
      .get(ref, {
        prefixUrl: this.legacyApiUrl,
        searchParams: opts,
      })
      .finally(ticketFree)
      .then((response, error) => {
        if ((error = this.#getIfHasError(response)) && error.code === 4 && error.message === 'Quota limit exceeded') {
          error[this.#retrySymbol] = retries.prior + 1;
          if (retries.remaining > 1)
            return this.#sendRequest(ref, opts, {prior: retries.prior + 1, remaining: retries.remaining - 1});
        }
        return response;
      });
  };

  totalTrials = 5;

  async wrappedCall(called) {
    const response = await called.catch(err => {
      throw new WebapiError(
        `${err.syscall ? `${err.syscall} ` : ''}${err.code} ${err.hostname || err.host}`,
        err.response ? err.response.statusCode : null,
      );
    });

    let error;
    if ((error = this.#getIfHasError(response))) {
      const err = new WebapiError(`${error.code} [${error.type}]: ${error.message}`, null, error.code);
      if (error[this.#retrySymbol]) err[this.#retrySymbol] = error[this.#retrySymbol];
      throw err;
    }

    return response.body;
  }

  #altAuth = {token: null, sessionId: null};

  async altApiCall(method, opts) {
    if (!this.#altAuth.token) {
      let result = await this._altApiCall('deezer.getUserData');
      this.#altAuth = {token: result.checkForm, sessionId: result.SESSION_ID};
    }

    return this._altApiCall(method, opts);
  }

  async _altApiCall(method, opts) {
    const response = await this.wrappedCall(
      this.requestObject.post(this.altApiUrl, {
        headers: {...(this.#altAuth?.sessionId && {cookie: `sid=${this.#altAuth.sessionId}`})},
        searchParams: {method, api_version: '1.0', api_token: this.#altAuth.token ?? ''},
        json: {lang: 'en', ...opts},
      }),
    );

    return response.results;
  }

  processID(gnFn) {
    return (id, opts) => this.wrappedCall(this.#sendRequest(gnFn(id), opts, this.totalTrials || 5));
  }

  processList(gnFn) {
    const wrapPagination = (id, wrpFnx, pagedURL, opts) =>
      pagedURL
        ? () => wrpFnx(id, (({index, limit}) => ({index, limit: limit || opts.limit}))(url.parse(pagedURL, true).query))
        : null;
    const decoyProcessor = async (id, opts = {}) => {
      const itemObject = await gnFn(id, {index: opts.index || 0, limit: Math.min(opts.limit, 300) || 300});
      itemObject.next = wrapPagination(id, decoyProcessor, itemObject.next, opts);
      itemObject.prev = wrapPagination(id, decoyProcessor, itemObject.prev, opts);
      return itemObject;
    };
    return decoyProcessor;
  }

  getTrack = this.processID(id => `track/${id}`);

  getAlbum = this.processID(id => `album/${id}`);

  getArtist = this.processID(id => `artist/${id}`);

  getPlaylist = this.processID(id => `playlist/${id}`);

  getAlbumTracks = this.processList((id, opts) => this.getAlbum(`${id}/tracks`, opts));

  getArtistAlbums = this.processList((id, opts) => this.getArtist(`${id}/albums`, opts));

  getPlaylistTracks = this.processList((id, opts) => this.getPlaylist(`${id}/tracks`, opts));
}

export default class Deezer {
  static [symbols.meta] = {
    ID: 'deezer',
    DESC: 'Deezer',
    PROPS: {
      isQueryable: true,
      isSearchable: false,
      isSourceable: false,
    },
    // https://www.debuggex.com/r/IuFIxSZGFJ07tOkR
    // Also matches: https://link.deezer.com/s/...
    VALID_URL:
      /(?:(?:(?:https?:\/\/)?(?:www\.)?)deezer.com(?:\/([a-z]{2}))?\/(track|album|artist|playlist)\/(\d+))|(?:deezer:(track|album|artist|playlist):(\d+))|(?:link\.deezer\.com\/s\/[a-zA-Z0-9]+)/,
    PROP_SCHEMA: {},
  };

  [symbols.meta] = Deezer[symbols.meta];

  #store = {
    core: new DeezerCore(),
    cache: new NodeCache(),
  };

  constructor(config) {
    if (config && 'retries' in config) this.#store.core.totalTrials = config.retries + 1;
  }

  loadConfig(_config) {}

  hasOnceAuthed() {
    throw Error('Unimplemented: [Deezer:hasOnceAuthed()]');
  }

  async isAuthed() {
    return true;
  }

  newAuth() {
    throw Error('Unimplemented: [Deezer:newAuth()]');
  }

  canTryLogin() {
    return true;
  }

  hasProps() {
    return false;
  }

  getProps() {
    throw Error('Unimplemented: [Deezer:getProps()]');
  }

  async login() {
    throw Error('Unimplemented: [Deezer:login()]');
  }

  validateType(uri) {
    const {type} = this.identifyType(uri);
    return type in validUriTypes;
  }

  identifyType(uri) {
    return this.parseURI(uri).type;
  }

  parseURI(uri, storefront) {
    // Check if this is a Deezer short link
    if (uri.includes('link.deezer.com')) {
      // For short links, return a placeholder that will be resolved later
      return {
        id: null,
        type: 'shortlink',
        uri: `deezer:shortlink:${uri}`,
        url: uri,
        storefront: storefront || 'en',
        isShortLink: true,
        originalUri: uri,
      };
    }
    
    const match = uri.match(Deezer[symbols.meta].VALID_URL);
    if (!match) return null;
    const isURI = !!match[4];
    const parsedURL = url.parse(uri, true);
    const id = isURI ? match[5] : path.basename(parsedURL.pathname);
    storefront = match[1] || storefront || 'en';
    const type = match[isURI ? 4 : 2];
    return {id, type, uri: `deezer:${type}:${id}`, url: `https://www.deezer.com/${storefront}/${type}/${id}`, storefront};
  }

  /**
   * Resolves a Deezer short link to the actual URL
   * @param {string} shortUrl - The short link URL
   * @returns {Promise<string|null>} - The resolved URL or null if failed
   */
  async resolveShortLink(shortUrl) {
    try {
      // Use got to follow redirects
      const response = await got(shortUrl, {
        method: 'GET',
        followRedirect: true,
        throwHttpErrors: false,
      });
      
      return response.url;
    } catch (err) {
      console.error(`Failed to resolve Deezer short link: ${err.message}`);
      return null;
    }
  }

  /**
   * Wraps track metadata from Deezer API response into a standardized format
   * 
   * This function extracts all available metadata from a Deezer track and
   * converts it into a format compatible with music-downloader metadata embedding system.
   * 
   * **Metadata Fields Extracted:**
   * 
   * **Basic Track Info:**
   * - `id`: Deezer track ID
   * - `uri`: Deezer URI (deezer:track:...)
   * - `link`: Deezer web URL
   * - `name`: Track title
   * - `duration`: Duration in milliseconds
   * 
   * **Artist Information:**
   * - `artists`: Array including primary artist and featured artists
   * - `featuring`: Featured artists extracted from contributor roles
   * - `artistSortNames`: Sort-formatted artist names (e.g., "Lipa, Dua" for "Dua Lipa")
   * - `album_artist`: Primary album artist name
   * - `composers`: All contributors mapped to composer field
   * 
   * **Album Information:**
   * - `album`: Album name
   * - `album_uri`: Deezer album URI
   * - `album_type`: Album type (album, single, compilation)
   * - `albumSortName`: Album sort name for alphabetizing
   * - `images`: Array of cover art URLs (small, medium, big, xl)
   * - `getImage(width, height)`: Function to get artwork URL of specified dimensions
   * - `albumDescription`: Album description/notes
   * 
   * **Track Details:**
   * - `track_number`: Track position on album
   * - `total_tracks`: Total tracks on album
   * - `disc_number`: Disc number
   * - `total_discs`: Total discs in album
   * - `release_date`: Release date timestamp
   * 
   * **Content Classification:**
   * - `contentRating`: Boolean for explicit lyrics
   * - `lyrics": Full lyrics if available (Deezer provides lyrics API)
   * - `genres`: Album genres
   * - `compilation": Boolean flag for compilation albums
   * 
   * **Identifiers & Catalog:**
   * - `isrc`: International Standard Recording Code
   * - `musicVideo`: Music video URL if available
   * - `label": Record label name
   * - `copyrights": Copyright information from producer line
   * 
   * **Dezer-Specific Metadata:**
   * - `deezerId`: Deezer track ID (same as id)
   * - `deezerAlbumId`: Deezer album ID
   * - `bpm`: Beats per minute (tempo)
   * - `gain`: Track gain for volume normalization
   * 
   * **Deezer API Advantages over Spotify:**
   * - Provides actual lyrics (not available in Spotify API)
   * - BPM and gain information for audio analysis
   * - Music video URL availability
   * - Detailed contributor roles (composers, producers, etc.)
   * - Album description field
   * 
   * @param {Object} trackInfo - Deezer track API response object
   * @param {Object} albumInfo - Album metadata (defaults to empty object)
   * @returns {Object} Standardized track metadata object
   */
  wrapTrackMeta(trackInfo, albumInfo = {}) {
    // Extract featured artists from contributors with 'feat' in their role
    const featuring = trackInfo.contributors 
      ? trackInfo.contributors.filter(c => c.role && c.role.toLowerCase().includes('feat')).map(c => c.name)
      : [];

    // Extract artist sort names
    const artistSortNames = [trackInfo.artist.name, ...featuring].map(name => 
      name.split(' ').reverse().join(', ') // Simple sort name transformation
    );

    return {
      id: trackInfo.id,
      uri: `deezer:track:${trackInfo.id}`,
      link: trackInfo.link,
      name: trackInfo.title,
      artists: [trackInfo.artist.name, ...featuring],
      featuring,
      artistSortNames,
      album: albumInfo.name,
      album_uri: `deezer:album:${albumInfo.id}`,
      album_type: albumInfo.type,
      albumSortName: albumInfo.name,
      images: albumInfo.images,
      duration: trackInfo.duration * 1000,
      album_artist: albumInfo.artists[0],
      track_number: trackInfo.track_position,
      total_tracks: albumInfo.ntracks,
      release_date: new Date(trackInfo.release_date),
      disc_number: trackInfo.disk_number,
      total_discs: albumInfo.tracks?.reduce((acc, track) => Math.max(acc, track.altData?.DISK_NUMBER || 1), 1) || 1,
      contentRating: !!trackInfo.explicit_lyrics,
      lyrics: trackInfo.lyrics || null,
      isrc: trackInfo.isrc,
      musicVideo: trackInfo.MUSIC_VIDEO?.url || null,
      genres: albumInfo.genres,
      label: albumInfo.label,
      copyrights: albumInfo.copyrights,
      composers: trackInfo.contributors?.map(composer => composer.name).join(', '),
      compilation: albumInfo.type === 'compilation',
      getImage: albumInfo.getImage,
      // Deezer specific
      deezerId: trackInfo.id,
      deezerAlbumId: albumInfo.id,
      bpm: trackInfo.bpm || null,
      gain: trackInfo.gain || null,
      // Subscription quality metadata
      albumDescription: albumInfo.description || null,
    };
  }

  wrapAlbumData(albumObject, altAlbumObject) {
    const artistObject = albumObject.artist || {};
    let altTracks = Object.fromEntries((altAlbumObject.SONGS?.data || []).map(track => [track.SNG_ID, track]));
    return {
      id: albumObject.id,
      uri: albumObject.link,
      name: albumObject.title,
      artists: [artistObject.name],
      type:
        artistObject.name === 'Various Artists' && artistObject.id === 5080
          ? 'compilation'
          : albumObject.record_type === 'single'
            ? 'single'
            : 'album',
      genres: ((albumObject.genres || {}).data || []).map(genre => genre.name),
      copyrights: [{type: 'P', text: altAlbumObject.DATA.PRODUCER_LINE}],
      images: [albumObject.cover_small, albumObject.cover_medium, albumObject.cover_big, albumObject.cover_xl],
      label: albumObject.label,
      release_date: new Date(albumObject.release_date),
      ntracks: albumObject.nb_tracks,
      tracks: albumObject.tracks.data.map(track => ({...track, altData: altTracks[track.id]})),
      getImage(width, height) {
        const min = (val, max) => Math.min(max, val) || max;
        return this.images
          .slice()
          .pop()
          .replace(/(?<=.+\/)\d+x\d+(?=.+$)/g, `${min(width, 1800)}x${min(height, 1800)}`);
      },
    };
  }

  wrapArtistData(artistObject) {
    return {
      id: artistObject.id,
      uri: artistObject.link,
      name: artistObject.name,
      genres: null,
      nalbum: artistObject.nb_album,
      followers: artistObject.nb_fan,
    };
  }

  wrapPlaylistData(playlistObject) {
    return {
      id: playlistObject.id,
      uri: playlistObject.link,
      name: playlistObject.title,
      followers: playlistObject.fans,
      description: playlistObject.description,
      owner_id: playlistObject.creator.id,
      owner_name: playlistObject.creator.name,
      type: `${playlistObject.public ? 'Public' : 'Private'}${playlistObject.collaborative ? ' (Collaborative)' : ''}`,
      ntracks: playlistObject.nb_tracks,
      tracks: playlistObject.tracks,
    };
  }

  createDataProcessor(coreFn) {
    return async uri => {
      let parsed = this.parseURI(uri);
      
      // Handle Deezer short links - resolve them first
      if (parsed && parsed.isShortLink) {
        const resolvedUrl = await this.resolveShortLink(uri);
        if (resolvedUrl) {
          // Re-parse with the resolved URL
          parsed = this.parseURI(resolvedUrl);
          uri = resolvedUrl;
        }
      }
      
      if (!parsed || !parsed.id) return null;
      if (!this.#store.cache.has(parsed.uri)) this.#store.cache.set(parsed.uri, await coreFn(parsed.id));
      return this.#store.cache.get(parsed.uri);
    };
  }

  trackQueue = new AsyncQueue(
    'deezer:trackQueue',
    4,
    this.createDataProcessor(async id => {
      const track = await this.#store.core.getTrack(id);
      return this.wrapTrackMeta(track, await this.getAlbum(`deezer:album:${track.album.id}`));
    }),
  );

  async getTrack(uris) {
    return this.trackQueue.push(uris);
  }

  albumQueue = new AsyncQueue(
    'deezer:albumQueue',
    4,
    this.createDataProcessor(async id => {
      let [album, altAlbumData] = await Promise.all([
        this.#store.core.getAlbum(id),
        this.#store.core.altApiCall('deezer.pageAlbum', {alb_id: id}),
      ]);
      return this.wrapAlbumData(album, altAlbumData);
    }),
  );

  async getAlbum(uris) {
    return this.albumQueue.push(uris);
  }

  artistQueue = new AsyncQueue(
    'deezer:artistQueue',
    4,
    this.createDataProcessor(async id => this.wrapArtistData(await this.#store.core.getArtist(id))),
  );

  async getArtist(uris) {
    return this.artistQueue.push(uris);
  }

  playlistQueue = new AsyncQueue(
    'deezer:playlistQueue',
    4,
    this.createDataProcessor(async id => this.wrapPlaylistData(await this.#store.core.getPlaylist(id, {limit: 1}))),
  );

  async getPlaylist(uris) {
    return this.playlistQueue.push(uris);
  }

  async getAlbumTracks(uri) {
    const album = await this.getAlbum(uri);
    return this.trackQueue.push(album.tracks.map(track => track.link));
  }

  async getArtistAlbums(uris) {
    const artist = await this.getArtist(uris);
    return this.wrapPagination(
      () => this.#store.core.getArtistAlbums(artist.id, {limit: Math.min(artist.nalbum, Math.max(300, artist.nalbum / 4))}),
      data => this.albumQueue.push(data.map(album => album.link)),
    );
  }

  async getPlaylistTracks(uri) {
    const playlist = await this.getPlaylist(uri);
    return this.wrapPagination(
      () =>
        this.#store.core.getPlaylistTracks(playlist.id, {limit: Math.min(playlist.ntracks, Math.max(300, playlist.ntracks / 4))}),
      data => this.trackQueue.push(data.map(track => track.link)),
    );
  }

  async wrapPagination(genFn, processor) {
    const collateAllPages = async px => {
      const page = await px();
      if (page.next) page.data.push(...(await collateAllPages(page.next)));
      return page.data;
    };
    const results = await collateAllPages(genFn);
    return processor ? processor(results) : results;
  }
}
