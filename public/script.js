document.addEventListener('DOMContentLoaded', () => {
    // Tabs Navigation
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchTab(tab.dataset.tab);
        });
    });

    // Initialize Visualizer
    initVisualizer();
    
    // Player Controls
    const playBtn = document.getElementById('play-pause-btn');
    if (playBtn) playBtn.addEventListener('click', togglePlay);
    
    const lyricsBtn = document.getElementById('lyrics-btn');
    if (lyricsBtn) lyricsBtn.addEventListener('click', toggleLyrics);
    
    const closeLyricsBtn = document.getElementById('close-lyrics');
    if (closeLyricsBtn) closeLyricsBtn.addEventListener('click', toggleLyrics);

    const volumeBtn = document.getElementById('volume-btn');
    if (volumeBtn) volumeBtn.addEventListener('click', toggleMute);
    
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const volumeSlider = document.getElementById('volume-slider');
    const audio = document.getElementById('main-audio');
    
    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
             const rect = progressContainer.getBoundingClientRect();
             const pos = (e.clientX - rect.left) / rect.width;
             if (audio && audio.duration) {
                 audio.currentTime = pos * audio.duration;
             }
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            if (audio) audio.volume = volumeSlider.value;
        });
    }

    if (audio) {
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onTrackEnded);
        audio.addEventListener('play', () => {
             if (playBtn) playBtn.textContent = '⏸';
             initVisualizer(); // Start visualizer on play
        });
        audio.addEventListener('pause', () => {
             if (playBtn) playBtn.textContent = '▶';
        });
    }
});

// State Management
let currentMetadata = null;
let playerPlaylist = [];
let currentTrackIndex = 0;
let lyricsData = []; // Array of {time: seconds, text: string}
let isShuffle = false;
let repeatMode = 'off'; // 'off', 'all', 'one'
let shuffleHistory = []; // Indices played in shuffle mode
let shuffleIndex = -1; // Current index in shuffle history

// --- Music Functions ---

/**
 * Fetch metadata for the entered URL
 */
async function fetchMetadata() {
    const url = document.getElementById('searchInput').value;
    const resultsDiv = document.getElementById('results');
    
    if (!url) return;
    
    // UI Feedback
    resultsDiv.innerHTML = '<div class="loader">Recherche en cours...</div>';

    try {
        const response = await fetch(`/api/metadata?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) {
            resultsDiv.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }

        currentMetadata = data;
        renderResults(data);

    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">Erreur: ${error.message}</div>`;
        console.error(error);
    }
}

function renderResults(data) {
    const resultsDiv = document.getElementById('results');
    
    // Header Info
    const firstTrack = data.tracks[0];
    const isPlaylist = data.type === 'playlist' || data.type === 'album';
    
    let html = `
        <div class="playlist-header">
            <img id="playlist-cover" src="${firstTrack.cover_url || ''}" alt="Cover">
            <div class="playlist-info">
                <h2 id="playlist-title">${isPlaylist ? (data.tracks[0].album || 'Playlist') : firstTrack.name}</h2>
                <p id="playlist-meta">${firstTrack.artists[0]} • ${data.tracks.length} titres</p>
            </div>
        </div>

        <div class="options-group">
            <div class="select-wrapper">
                <label for="quality">Qualité</label>
                <select id="quality">
                    <option value="320">320 kbps (Haute)</option>
                    <option value="192">192 kbps (Moyenne)</option>
                    <option value="128">128 kbps (Basse)</option>
                </select>
            </div>
            <div class="select-wrapper">
                <label for="format">Format</label>
                <select id="format">
                    <option value="m4a">M4A (AAC/ALAC)</option>
                    <option value="mp3">MP3</option>
                    <option value="flac">FLAC (Lossless)</option>
                </select>
            </div>
        </div>

        <div class="track-controls">
            <label class="checkbox-container">
                <input type="checkbox" id="select-all" checked>
                <span class="checkmark"></span>
                Tout sélectionner
            </label>
            <span id="selected-count">${data.tracks.length} sélectionnés</span>
            <button id="download-music-btn" class="action-btn" onclick="downloadSelectedTracks()">Télécharger la sélection</button>
        </div>
        
        <div id="download-progress" class="hidden">
             <p>Téléchargement en cours...</p>
             <pre id="logs-output"></pre>
        </div>

        <div id="track-list" class="track-list">
    `;

    // Update Player Playlist
    playerPlaylist = data.tracks;

    data.tracks.forEach((track, index) => {
        html += `
            <div class="track-item" onclick="loadTrack(${index})">
                <label class="checkbox-container" onclick="event.stopPropagation()">
                    <input type="checkbox" class="track-checkbox" value="${index}" checked>
                    <span class="checkmark"></span>
                </label>
                <div class="track-info">
                    <div class="track-name">${track.name}</div>
                    <div class="track-artist">${Array.isArray(track.artists) ? track.artists.join(', ') : track.artists}</div>
                </div>
                <div class="track-duration">${formatDuration(track.duration)}</div>
            </div>
        `;
    });

    html += `</div>`;
    resultsDiv.innerHTML = html;

    // Re-attach event listeners for checkboxes
    const selectAll = document.getElementById('select-all');
    const checkboxes = resultsDiv.querySelectorAll('.track-checkbox');
    const selectedCount = document.getElementById('selected-count');

    function updateCount() {
        const count = resultsDiv.querySelectorAll('.track-checkbox:checked').length;
        selectedCount.textContent = `${count} sélectionnés`;
    }

    selectAll.addEventListener('change', (e) => {
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateCount();
    });

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            updateCount();
            selectAll.checked = [...checkboxes].every(c => c.checked);
        });
    });
}

async function downloadSelectedTracks() {
    const checkboxes = document.querySelectorAll('.track-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedIndices.length === 0) {
        alert('Veuillez sélectionner au moins un titre.');
        return;
    }

    const selectedUrls = selectedIndices.map(i => {
        const t = playerPlaylist[i];
        // Priority: explicit URL -> Link -> URI
        return t.url || t.link || t.uri;
    });
    
    // Check for missing URLs
    const missingCount = selectedUrls.filter(u => !u).length;
    if (missingCount > 0) {
        // Fallback: If all selected tracks are from the same album/playlist and we have its URL, 
        // we might be able to download the whole thing, but we can't easily pick specific tracks via the current backend.
        // So we warn the user.
        if (!confirm(`${missingCount} titres sélectionnés n'ont pas de lien direct valide et pourraient échouer. Continuer quand même ?`)) {
            return;
        }
    }

    const validUrls = selectedUrls.filter(u => u);
    
    if (validUrls.length === 0) {
        // Final fallback: try using the main URL if it's a single track context or user wants to download the whole container?
        // But here we are in "Selected Tracks" mode.
        alert("Impossible de récupérer les liens des titres sélectionnés. Essayez de télécharger l'album/playlist complet si possible.");
        return;
    }
    
    const quality = document.getElementById('quality').value;
    const format = document.getElementById('format').value;
    const btn = document.getElementById('download-music-btn');
    const progressDiv = document.getElementById('download-progress');
    const logsOutput = document.getElementById('logs-output');

    btn.disabled = true;
    btn.textContent = 'Démarrage...';
    progressDiv.classList.remove('hidden');

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: validUrls, quality, format })
        });
        
        const result = await response.json();
        if (result.success) {
            logsOutput.textContent = 'Téléchargement démarré en arrière-plan...\n' + (result.logs || '');
            alert('Téléchargement lancé !');
        } else {
            logsOutput.textContent = 'Erreur: ' + result.error;
        }
    } catch (e) {
        logsOutput.textContent = 'Erreur: ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Télécharger la sélection';
    }
}

// --- Video Functions ---

async function downloadVideo() {
    const url = document.getElementById('videoInput').value;
    const btn = document.querySelector('#video-tab button'); // Simple way to get the button
    const resultDiv = document.getElementById('video-results');
    
    if (!url) return;

    btn.disabled = true;
    btn.textContent = 'Téléchargement...';
    resultDiv.innerHTML = '<div class="loader">Téléchargement en cours...</div>';

    try {
        const response = await fetch('/api/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `
                <h3>Vidéo téléchargée !</h3>
                <video id="video-player" controls width="100%" src="${data.downloadUrl}"></video>
                <a id="video-download-link" href="${data.downloadUrl}" class="action-btn" download="${data.filename}">Sauvegarder le fichier</a>
            `;
        } else {
            resultDiv.innerHTML = `<div class="error">Erreur: ${data.error}</div>`;
        }
    } catch (e) {
        resultDiv.innerHTML = `<div class="error">Erreur: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Télécharger Vidéo';
    }
}

// --- Player Functions ---

async function loadTrack(index) {
    currentTrackIndex = index;
    const track = playerPlaylist[index];
    
    // UI Updates
    document.getElementById('player-bar').classList.remove('hidden');
    document.getElementById('player-title').textContent = track.name;
    document.getElementById('player-artist').textContent = Array.isArray(track.artists) ? track.artists.join(', ') : track.artists;
    const artEl = document.getElementById('player-art');
    if (artEl) artEl.src = track.cover_url || artEl.src;
    
    // Highlight in list
    document.querySelectorAll('.track-item').forEach((el, i) => {
        if (i === index) el.classList.add('playing');
        else el.classList.remove('playing');
    });

    // Audio Source
    const audio = document.getElementById('main-audio');
    
    // Check for Preview URL or Stream
    // Prioritize our live stream endpoint for full playback
    const query = `${track.name} ${Array.isArray(track.artists) ? track.artists[0] : track.artists}`;
    const streamUrl = `/api/stream?query=${encodeURIComponent(query)}`;
    
    // Set audio source to stream
    audio.src = streamUrl;
    
    // Fallback or Pre-check?
    // We just set the source. If it fails, the error event will trigger.
    
    // Update player status
    document.getElementById('play-pause-btn').textContent = '⏳'; // Loading state
    
    audio.oncanplay = () => {
        document.getElementById('play-pause-btn').textContent = '⏸'; // Ready to play
        audio.play().catch(e => console.error("Play error:", e));
        audio.oncanplay = null; // Remove listener
    };

    audio.onerror = () => {
        console.error("Stream error, falling back to preview if available");
        if (track.preview_url) {
            audio.src = track.preview_url;
            audio.play().catch(e => console.error("Preview play error:", e));
        } else {
            alert("Impossible de lire ce titre (Stream échoué et pas d'aperçu).");
            document.getElementById('play-pause-btn').textContent = '▶';
        }
    };
    
    // Auto-fetch Lyrics
    await fetchLyrics(track);

    audio.play().then(() => {
        document.getElementById('play-pause-btn').textContent = '⏸';
    }).catch(e => console.error("Play error:", e));
}

async function fetchLyrics(track) {
    const syncedLyricsDiv = document.getElementById('synced-lyrics');
    syncedLyricsDiv.innerHTML = '<p>Chargement des paroles...</p>';
    lyricsData = [];

    // Check if lyrics already in metadata
    let lyricsLRC = track.lyricsLRC;
    
    if (!lyricsLRC) {
        // Fetch from API
        try {
            const response = await fetch(`/api/lyrics?title=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artists[0])}&duration=${track.duration/1000}`);
            const data = await response.json();
            lyricsLRC = data.lyricsLRC;
        } catch (e) {
            console.error("Lyrics fetch failed", e);
        }
    }

    if (lyricsLRC) {
        parseLRC(lyricsLRC);
        renderLyrics();
    } else {
        syncedLyricsDiv.innerHTML = '<p>Pas de paroles synchronisées disponibles.</p>';
    }
}

function parseLRC(lrc) {
    lyricsData = [];
    const lines = lrc.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    lines.forEach(line => {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const msStr = match[3];
            let milliseconds = parseInt(msStr);
            if (msStr.length === 2) {
                milliseconds *= 10;
            }
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
                lyricsData.push({ time, text });
            }
        }
    });
}

function renderLyrics() {
    const div = document.getElementById('synced-lyrics');
    div.innerHTML = '';
    
    lyricsData.forEach((line, index) => {
        const p = document.createElement('p');
        p.className = 'lyric-line';
        p.id = `lyric-${index}`;
        p.textContent = line.text;
        p.onclick = () => {
            document.getElementById('main-audio').currentTime = line.time;
        };
        div.appendChild(p);
    });
}

function updateProgress() {
    const audio = document.getElementById('main-audio');
    const progressBar = document.getElementById('progress-bar');
    if (!audio || !progressBar || isNaN(audio.duration)) return;

    const percent = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    
    if (lyricsData.length > 0) {
        let activeIndex = -1;
        for (let i = 0; i < lyricsData.length; i++) {
            if (audio.currentTime >= lyricsData[i].time) {
                activeIndex = i;
            } else {
                break;
            }
        }
        
        if (activeIndex !== -1) {
            document.querySelectorAll('.lyric-line').forEach(l => l.classList.remove('active'));
            const activeLine = document.getElementById(`lyric-${activeIndex}`);
            if (activeLine) {
                activeLine.classList.add('active');
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

function togglePlay() {
    const audio = document.getElementById('main-audio');
    const btn = document.getElementById('play-pause-btn');
    
    if (audio.paused) {
        audio.play();
        btn.textContent = '⏸';
    } else {
        audio.pause();
        btn.textContent = '▶';
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('shuffle-btn');
    btn.classList.toggle('active', isShuffle);
    
    if (isShuffle) {
        // Initialize shuffle history with current track
        shuffleHistory = [currentTrackIndex];
        shuffleIndex = 0;
    } else {
        // Clear history when disabling shuffle
        shuffleHistory = [];
        shuffleIndex = -1;
    }
}

function toggleRepeat() {
    const btn = document.getElementById('repeat-btn');
    if (repeatMode === 'off') {
        repeatMode = 'all';
        btn.classList.add('active');
        btn.textContent = '🔁'; 
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
        btn.classList.add('active');
        btn.textContent = '🔂'; 
    } else {
        repeatMode = 'off';
        btn.classList.remove('active');
        btn.textContent = '🔁';
    }
}

function onTrackEnded() {
    if (repeatMode === 'one') {
        const audio = document.getElementById('main-audio');
        audio.currentTime = 0;
        audio.play();
    } else {
        playNext();
    }
}

function playPrev() {
    if (playerPlaylist.length === 0) return;
    
    const audio = document.getElementById('main-audio');
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    let prevIndex;
    if (isShuffle) {
        if (shuffleIndex > 0) {
            shuffleIndex--;
            prevIndex = shuffleHistory[shuffleIndex];
        } else {
            // If at start of history, pick random or just stay
            // Better: pick a random previous track that isn't current
             let newIndex;
            do {
                newIndex = Math.floor(Math.random() * playerPlaylist.length);
            } while (newIndex === currentTrackIndex && playerPlaylist.length > 1);
            
            shuffleHistory.unshift(newIndex); // Add to history start
            // shuffleIndex stays 0 as we prepended
            prevIndex = newIndex;
        }
    } else {
        prevIndex = currentTrackIndex - 1;
    }

    if (prevIndex < 0) {
        if (repeatMode === 'all') {
            prevIndex = playerPlaylist.length - 1;
        } else {
            return; 
        }
    }
    
    loadTrack(prevIndex);
}

function playNext() {
    if (playerPlaylist.length === 0) return;

    let nextIndex;
    if (isShuffle) {
        // Check if we have forward history (e.g. user went back)
        if (shuffleIndex < shuffleHistory.length - 1) {
            shuffleIndex++;
            nextIndex = shuffleHistory[shuffleIndex];
        } else {
            // Pick new random track
            let availableIndices = playerPlaylist.map((_, i) => i).filter(i => !shuffleHistory.includes(i));
            
            // If all played, reset available? Or just pick random not current
            if (availableIndices.length === 0) {
                 availableIndices = playerPlaylist.map((_, i) => i).filter(i => i !== currentTrackIndex);
            }
            
            if (availableIndices.length > 0) {
                const randomIdx = Math.floor(Math.random() * availableIndices.length);
                nextIndex = availableIndices[randomIdx];
            } else {
                nextIndex = currentTrackIndex; // Should not happen unless 1 track
            }
            
            shuffleHistory.push(nextIndex);
            shuffleIndex++;
        }
    } else {
        nextIndex = currentTrackIndex + 1;
    }

    if (nextIndex >= playerPlaylist.length) {
        if (repeatMode === 'all') {
            nextIndex = 0;
        } else {
            return; 
        }
    }
    
    loadTrack(nextIndex);
}

/**
 * Toggle lyrics overlay visibility
 */
function toggleLyrics() {
    document.getElementById('lyrics-overlay').classList.toggle('hidden');
}

/**
 * Toggle mute state
 */
function toggleMute() {
    const audio = document.getElementById('main-audio');
    audio.muted = !audio.muted;
    document.getElementById('volume-btn').textContent = audio.muted ? '🔇' : '🔊';
}

/**
 * Format milliseconds to MM:SS
 * @param {number} ms 
 * @returns {string}
 */
function formatDuration(ms) {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// --- Library & Visualizer Functions ---

/**
 * Switch between tabs (Music, Video, Library)
 * @param {string} tabId 
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`${tabId}-tab`);
    if (target) {
        target.classList.add('active');
        // Hide/Show player bar based on context if needed
    }
    
    if (tabId === 'library') {
        loadLibrary();
    }
}

/**
 * Load downloaded files from server
 */
async function loadLibrary() {
    const list = document.getElementById('library-list');
    if (!list) return;
    list.innerHTML = '<div class="loading">Chargement...</div>';
    
    try {
        const res = await fetch('/api/library');
        const data = await res.json();
        
        if (data.success && data.files.length > 0) {
            // Generate HTML for file list
            const html = data.files.map((file, index) => {
                // Escape quotes for onclick attribute
                const safeTitle = file.title.replace(/'/g, "\\'");
                const safeArtist = file.artist.replace(/'/g, "\\'");
                const safeUrl = file.url.replace(/'/g, "\\'");
                
                return `
                <div class="track-item" onclick="playLibraryFile('${safeUrl}', '${safeTitle}', '${safeArtist}', '${file.type}')">
                    <div class="track-info">
                        <div class="track-name">${file.title}</div>
                        <div class="track-artist">${file.artist}</div>
                    </div>
                    <div class="track-duration">${file.type === 'video' ? 'Video' : 'Audio'}</div>
                </div>
                `;
            }).join('');
            
            list.innerHTML = html;
        } else {
            list.innerHTML = '<div class="error">Bibliothèque vide. Commencez par télécharger des titres !</div>';
        }
    } catch (e) {
        list.innerHTML = `<div class="error">Erreur: ${e.message}</div>`;
    }
}

/**
 * Play a file from the library
 * @param {string} url 
 * @param {string} title 
 * @param {string} artist 
 * @param {string} type 
 */
function playLibraryFile(url, title, artist, type) {
    document.getElementById('player-bar').classList.remove('hidden');
    document.getElementById('player-title').textContent = title;
    document.getElementById('player-artist').textContent = artist;
    
    const artEl = document.getElementById('player-art');
    if (artEl) {
        artEl.src = type === 'video' 
            ? 'https://via.placeholder.com/300?text=Video' 
            : 'https://via.placeholder.com/300?text=Audio';
    }
    
    document.getElementById('synced-lyrics').innerHTML = '<p>Lecture locale (Pas de paroles)</p>';
    
    const audio = document.getElementById('main-audio');
    audio.src = url;
    audio.play().then(() => {
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.textContent = '⏸';
    }).catch(e => console.error("Library play error:", e));
}

let audioContext, analyser, source, canvas, ctx;

/**
 * Initialize Web Audio API Visualizer
 */
function initVisualizer() {
    canvas = document.getElementById('visualizer');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    const resize = () => {
        if (canvas.parentElement) {
            canvas.width = canvas.parentElement.offsetWidth;
            canvas.height = canvas.parentElement.offsetHeight;
        }
    };
    window.addEventListener('resize', resize);
    resize();
    
    // AudioContext requires user interaction first
    document.addEventListener('click', setupAudioContext, { once: true });
}

function setupAudioContext() {
    if (audioContext) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    const audio = document.getElementById('main-audio');
    
    try {
        // Connect audio element to analyser
        if (!source) {
            source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        }
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function draw() {
            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            
            for(let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2; // Scale down height
                
                // Color gradient based on frequency
                const r = barHeight + (25 * (i/bufferLength));
                const g = 250 * (i/bufferLength);
                const b = 50;
                
                ctx.fillStyle = `rgba(${r},${g},${b}, 0.5)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        }
        draw();
    } catch(e) {
        console.error("Audio Context Error", e);
    }
}
