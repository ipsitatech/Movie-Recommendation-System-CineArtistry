// Global variables
let allMovies = [];
let currentProvider = 'all';
let currentGenre = 'all';
let currentSearch = '';
let searchTimeout;

// Global hero movie reference
let heroMovie = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    syncUserActivity().then(() => {
        loadHero();
        loadMovies();
        setupEventListeners();
        setup3DToggle();
        setupProviderFilters();
        setupGenreCards();
        loadNewReleases('all');
        startNRAutoRefresh();
        loadTrending();
    });
});


// ── Genre Card Filter ────────────────────────────────────────────────────────
function setupGenreCards() {
    const cards = document.querySelectorAll('.genre-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const genre = card.dataset.genre;
            // Toggle: clicking the active genre resets to all
            if (currentGenre === genre) {
                currentGenre = 'all';
                cards.forEach(c => c.classList.remove('active-genre'));
            } else {
                currentGenre = genre;
                cards.forEach(c => c.classList.remove('active-genre'));
                card.classList.add('active-genre');
            }
            renderAggregatorRows();
            // Smooth scroll to movie rows
            const rows = document.getElementById('movie-rows-container');
            if (rows) rows.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}


// ── Hero Section: Dynamic Load ──────────────────────────────────────────────
async function loadHero() {
    try {
        const res = await fetch('/api/hero');
        heroMovie = await res.json();

        // Update background image with movie poster if valid
        if (heroMovie.image_url && !heroMovie.image_url.includes('placeholder')) {
            const bg = document.getElementById('heroBg');
            if (bg) {
                // Try using poster as blurred background
                bg.onerror = null; // keep fallback if poster fails
            }
        }

        // Set title
        const titleEl = document.getElementById('heroTitle');
        if (titleEl) {
            titleEl.textContent = heroMovie.title || 'CineArtistry';
        }

        // Set meta tags (genre / language)
        const metaEl = document.getElementById('heroMeta');
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="hero-tag">${heroMovie.genre || ''}</span>
                <span class="hero-tag hero-tag-lang">${heroMovie.language || ''}</span>
            `;
        }

        // Set description
        const descEl = document.getElementById('heroDescription');
        if (descEl) {
            const descriptions = {
                'Interstellar': 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
                'Inception': 'A thief who steals corporate secrets through dream-sharing technology is given the task of planting an idea.',
                'The Dark Knight': 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must unmask the troublemaker.',
                'Parasite': 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the impoverished Kim clan.',
                'Spirited Away': 'During her family\'s move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods and witches.',
                'The Godfather': 'An organized crime dynasty\'s aging patriarch transfers control of his clandestine empire to his reluctant son.',
                'Dangal': 'Former wrestler Mahavir Singh Phogat trains his daughters Geeta and Babita to become India\'s first world-class female wrestlers.',
                'Sholay': 'Two criminals are hired by a retired police officer to capture a ruthless dacoit who terrorizes a village.',
                'Baahubali': 'In ancient India, an adventurous and daring man gets to know about his legacy and his father\'s agonizing death.',
            };
            descEl.textContent = descriptions[heroMovie.title] || `Experience ${heroMovie.title} – a ${heroMovie.genre} masterpiece from ${heroMovie.language} cinema.`;
        }

        // Animate in
        const content = document.getElementById('heroContent');
        if (content) {
            content.classList.add('hero-animate-in');
        }

    } catch (e) {
        console.error('Failed to load hero:', e);
    }
}

function handleHeroPlay() {
    if (!heroMovie) return;
    const match = heroMovie.youtube_link && heroMovie.youtube_link.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (match && match[1]) {
        // Open modal with the video
        openMovieModal(heroMovie);
    } else {
        // fallback: open search
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(heroMovie.title + ' trailer')}`, '_self');
    }
}

function handleHeroInfo() {
    if (!heroMovie) return;
    openMovieModal(heroMovie);
}
// ────────────────────────────────────────────────────────────────────────────

const providerConfig = {
    netflix: { color: '#e50914', label: 'N' },
    prime: { color: '#00a8e1', label: 'P' },
    disney: { color: '#113ccf', label: 'D' },
    apple: { color: '#000000', label: 'A' },
    hbo: { color: '#5e42a6', label: 'H' }
};

function setupProviderFilters() {
    const items = document.querySelectorAll('.provider-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            items.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentProvider = item.dataset.provider;
            renderAggregatorRows();
        });
    });
}

function setup3DToggle() {
    const btn = document.getElementById('toggle3D');
    const container = document.getElementById('three-canvas-container');
    if (!btn || !container) return;

    btn.addEventListener('click', () => {
        container.classList.toggle('hidden');
        if (!container.classList.contains('hidden')) {
            btn.innerHTML = '<i class="fas fa-th"></i> Grid Discovery';
            btn.classList.add('discovery-active');
            // Launch Three.js lazily — only once the container is visible with real dimensions
            setTimeout(() => {
                if (typeof window.initThreeScene === 'function') {
                    window.initThreeScene();
                }
            }, 50);
        } else {
            btn.innerHTML = '<i class="fas fa-cube"></i> Discover in 3D';
            btn.classList.remove('discovery-active');
        }
    });
}


// Load movies from API
async function loadMovies() {
    try {
        const response = await fetch('/api/movies');
        allMovies = await response.json();

        // Simulating availability data for JustWatch style
        allMovies.forEach(m => {
            const providers = Object.keys(providerConfig);
            m.provider = providers[Math.floor(Math.random() * providers.length)];
        });

        renderAggregatorRows();
    } catch (error) {
        console.error('Error loading movies:', error);
    }
}

async function renderAggregatorRows() {
    const container = document.getElementById('movie-rows-container');
    container.innerHTML = `
        <div class="loading-container">
            <div class="cinematic-loader"></div>
            <p>Curating your experience...</p>
        </div>
    `;

    // Apply Search Filter First (Global Search)
    if (currentSearch) {
        const feedback = document.getElementById('searchFeedback');
        if (feedback) feedback.classList.remove('hidden');

        try {
            const response = await fetch(`/api/search_external?q=${encodeURIComponent(currentSearch)}`);
            const externalResults = await response.json();
            
            if (feedback) feedback.classList.add('hidden');
            container.innerHTML = '';
            
            if (externalResults.length === 0) {
                container.innerHTML = `<p class="no-results">No movies found matching "${currentSearch}".</p>`;
                return;
            }

            // Show dedicated Search Results row
            createRow(`Results for "${currentSearch}"`, externalResults);

            // Also show relevant local results if any
            const localResults = allMovies.filter(m =>
                m.title.toLowerCase().includes(currentSearch.toLowerCase())
            ).filter(m => !externalResults.some(em => em.title === m.title));

            if (localResults.length > 0) {
                createRow('Recommended from Collection', localResults.slice(0, 20));
            }

            setTimeout(setupLazyLoading, 100);
            return;
        } catch (err) {
            console.error("Search API Error:", err);
            if (feedback) feedback.classList.add('hidden');
            // Fallback to local filtering if API fails
            let localMatches = allMovies.filter(m =>
                m.title.toLowerCase().includes(currentSearch.toLowerCase())
            );
            container.innerHTML = '';
            createRow(`Search Results (Local Fallback)`, localMatches.slice(0, 40));
            return;
        }
    }

    // Apply Provider Filter (Normal Browsing)
    let moviesToDisplay = allMovies;
    if (currentProvider !== 'all') {
        moviesToDisplay = moviesToDisplay.filter(m => m.provider === currentProvider);
    }
    // Apply Genre Filter
    if (currentGenre !== 'all') {
        moviesToDisplay = moviesToDisplay.filter(m =>
            m.genre && m.genre.toLowerCase().includes(currentGenre.toLowerCase())
        );
    }

    container.innerHTML = '';
    
    // ── My Movies & History (Prepended rows) ──────────────────────────────
    const watchlist = getWatchlist();
    if (watchlist.length > 0) {
        createRow('My Movies', watchlist);
    }
    
    const history = getHistory();
    if (history.length > 0) {
        createRow('Recently Viewed', history);
    }
    
    if (moviesToDisplay.length === 0) {
        if (watchlist.length === 0 && history.length === 0) {
            container.innerHTML = '<p class="no-results">No movies found matching your selection.</p>';
        }
        return;
    }

    // Group movies by genre efficiently for normal rows
    const genres = {};
    moviesToDisplay.forEach(movie => {
        const movieGenres = (movie.genre || 'Action').split(', ');
        movieGenres.forEach(g => {
            if (!genres[g]) genres[g] = [];
            genres[g].push(movie);
        });
    });

    const categories = ['Action', 'Sci-Fi', 'Horror', 'Romantic', 'Comedy', 'Drama', 'Thriller'];

    // Rows
    createRow('Popular Movies', [...moviesToDisplay].sort(() => 0.5 - Math.random()).slice(0, 40));

    categories.forEach(cat => {
        if (genres[cat] && genres[cat].length > 0) {
            createRow(cat, genres[cat].slice(0, 40));
        }
    });


    setTimeout(setupLazyLoading, 100);
}

function createRow(title, movies) {
    const container = document.getElementById('movie-rows-container');

    const row = document.createElement('div');
    row.className = 'movie-row';

    row.innerHTML = `
        <h2 class="row-header">${title}</h2>
        <div class="row-container">
            <button class="handle handlePrev active"><i class="fas fa-chevron-left"></i></button>
            <div class="row-slider"></div>
            <button class="handle handleNext active"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;

    const slider = row.querySelector('.row-slider');
    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        
        const isRemovable = title === 'Recently Viewed' || title === 'My Movies';
        
        card.innerHTML = `
            ${isRemovable ? `<div class="remove-btn" title="Remove from list"><i class="fas fa-times"></i></div>` : ''}
            <div class="movie-poster-container">
                <img src="${movie.image_url}" class="movie-poster" alt="${movie.title}" loading="lazy" onerror="handlePosterError(this, '${(movie.title||'').replace(/'/g,"\\'")}')">
                <div class="poster-fallback-text">${movie.title}</div>
            </div>
            <div class="movie-info">
                <div class="movie-title">${movie.title}</div>
                <div class="movie-meta">${movie.genre || ''} ${movie.release_year ? '• ' + movie.release_year : ''}</div>
            </div>
        `;

        // Click on card opens modal
        card.addEventListener('click', (e) => {
            if (e.target.closest('.remove-btn')) {
                e.stopPropagation();
                removeFromList(title, movie);
                return;
            }
            addToHistory(movie);
            openMovieModal(movie);
        });
        slider.appendChild(card);
    });

    const next = row.querySelector('.handleNext');
    const prev = row.querySelector('.handlePrev');
    next.addEventListener('click', () => {
        slider.scrollBy({ left: slider.clientWidth * 0.8, behavior: 'smooth' });
    });
    prev.addEventListener('click', () => {
        slider.scrollBy({ left: -slider.clientWidth * 0.8, behavior: 'smooth' });
    });

    container.appendChild(row);
}

// Create movie card element with native lazy loading
function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.style.marginRight = '12px';

    const p = providerConfig[movie.provider] || { color: '#555', label: '?' };
    const inWatchlist = isInWatchlist(movie.id || movie.title);

    // Escape title for HTML attributes
    const safeTitle = (movie.title || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    const movieData = JSON.stringify(movie).replace(/"/g, '&quot;');
    const hasImage = movie.image_url && movie.image_url.trim() !== '' && movie.image_url !== 'N/A';

    card.innerHTML = `
        <div class="provider-badge" style="background:${p.color}">${p.label}</div>
        <button class="watchlist-btn ${inWatchlist ? 'active' : ''}" 
                onclick="toggleWatchlist(event, this)" 
                data-movie="${movieData}">
            <i class="fas fa-heart"></i>
        </button>
        <div class="movie-poster-container ${!hasImage ? 'use-fallback' : ''}">
            ${hasImage ? `
                <img src="${movie.image_url}" 
                     alt="${safeTitle}" 
                     class="movie-poster" 
                     loading="lazy"
                     decoding="async"
                     onload="validateImageSize(this)"
                     onerror="handlePosterError(this, '${safeTitle}')">
            ` : ''}
            <div class="poster-fallback-text">${movie.title}</div>
        </div>

        <div class="movie-info">
            <h3 class="movie-title">${movie.title}</h3>
        </div>
    `;

    card.addEventListener('click', (e) => {
        // Don't open modal if clicking the heart button
        if (e.target.closest('.watchlist-btn')) return;
        addToHistory(movie);
        openMovieModal(movie);
    });
    return card;
}


function handlePosterError(img, title) {
    // If image fails, swap with our cinematic default
    img.src = '/static/images/default-poster.jpg';
    img.style.objectFit = 'cover';
    
    // Set a flag so we don't loop if the default poster itself fails
    img.onerror = function() {
        this.style.display = 'none';
        const posterContainer = this.closest('.movie-poster-container');
        if (posterContainer) posterContainer.classList.add('use-fallback');
    };
}

// Add detection for YouTube "Unavailable" images (which are often 120x90 or 120x91)
function validateImageSize(img) {
    if (img.naturalWidth === 120 && (img.naturalHeight === 90 || img.naturalHeight === 91)) {
        // This is a YouTube placeholder!
        handlePosterError(img, '');
    }
}


// Lazy loading — replaced by native loading=lazy in img tags (no-op kept for compatibility)
function setupLazyLoading() { /* native loading=lazy handles this now */ }


// Open movie modal
async function openMovieModal(movie) {
    const modal = document.getElementById('movieModal');
    const modalBody = document.getElementById('modalBody');

    // Extract direct video ID if possible
    const match = movie.youtube_link && movie.youtube_link.match(
        /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    const directId = match && match[1] ? match[1] : null;

    // Shared modal metadata HTML
    const metaHtml = `
        <div style="margin-top: 1.5rem; color: var(--text-dim);">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.2rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                    <span style="font-size:0.7rem; opacity:0.5; display:block; letter-spacing:1px; text-transform:uppercase;">Genre</span>
                    <strong style="color:#fff;">${movie.genre}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                    <span style="font-size:0.7rem; opacity:0.5; display:block; letter-spacing:1px; text-transform:uppercase;">Language</span>
                    <strong style="color:#fff;">${movie.language}</strong>
                </div>
            </div>
            <h4 style="color: #fff; margin-bottom: 0.5rem;">Similar Movies</h4>
            <div id="movie-recommendations" class="recommendations-carousel">
                <p>Loading recommendations...</p>
            </div>
        </div>`;

    if (directId) {
        // Have a real video ID — embed immediately
        const embedUrl = `https://www.youtube.com/embed/${directId}?autoplay=1&rel=0&modestbranding=1`;
        modalBody.innerHTML = `
            <h2 style="margin-bottom: 1rem; color: var(--accent-gold);">${movie.title}</h2>
            <div class="video-container">
                <iframe src="${embedUrl}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen style="width:100%; aspect-ratio:16/9; border:none; border-radius:12px; min-height:300px;">
                </iframe>
            </div>
            ${metaHtml}`;
        modal.classList.add('active');
        loadRecommendations(movie.id);
    } else {
        // No direct ID — show spinner, then fetch real ID from backend
        modalBody.innerHTML = `
            <h2 style="margin-bottom: 1rem; color: var(--accent-gold);">${movie.title}</h2>
            <div class="video-container" id="videoSlot" style="display:flex; align-items:center; justify-content:center; min-height:280px; background: rgba(0,0,0,0.3); border-radius:12px;">
                <div style="text-align:center;">
                    <div class="cinematic-loader"></div>
                    <p style="color: var(--text-dim); margin-top: 1rem; font-size:0.9rem;">Finding trailer...</p>
                </div>
            </div>
            ${metaHtml}`;
        modal.classList.add('active');
        loadRecommendations(movie.id);

        // Fetch real video ID from backend
        try {
            const res = await fetch(`/api/search-trailer?title=${encodeURIComponent(movie.title)}`);
            const data = await res.json();
            const slot = document.getElementById('videoSlot');
            if (slot) {
                if (data.video_id) {
                    const embedUrl = `https://www.youtube.com/embed/${data.video_id}?autoplay=1&rel=0&modestbranding=1`;
                    slot.innerHTML = `<iframe src="${embedUrl}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen style="width:100%; aspect-ratio:16/9; border:none; border-radius:12px; min-height:300px;">
                    </iframe>`;
                } else {
                    // No ID found — show poster with open-in-youtube fallback
                    slot.innerHTML = `
                        <div style="position:relative; width:100%; text-align:center;">
                            <img src="${movie.image_url}" style="width:100%; border-radius:12px; max-height:300px; object-fit:cover; opacity:0.6;">
                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                                <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' official trailer')}"
                                   target="_blank"
                                   style="background: var(--accent-gold); color:#000; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:800; display:inline-flex; align-items:center; gap:10px;">
                                    <i class="fab fa-youtube" style="font-size:1.3rem;"></i> Watch on YouTube
                                </a>
                            </div>
                        </div>`;
                }
            }
        } catch (e) {
            console.error('Trailer search failed:', e);
        }
    }
}


async function loadRecommendations(movieId) {
    const container = document.getElementById('movie-recommendations');
    try {
        const response = await fetch(`/api/recommendations/${movieId}`);
        const recommendations = await response.json();

        container.innerHTML = recommendations.length ? '' : '<p>No similar movies found.</p>';
        recommendations.forEach(rec => {
            const div = document.createElement('div');
            div.className = 'recommendation-item';
            div.innerHTML = `
                <div class="movie-poster-container rec-poster-container">
                    <img src="${rec.image_url}" class="rec-poster" onerror="handlePosterError(this, '${rec.title.replace(/'/g, "\\'")}')">
                    <div class="poster-fallback-text" style="font-size: 0.6rem;">${rec.title}</div>
                </div>
                <p class="rec-title">${rec.title}</p>
            `;
            div.onclick = () => openMovieModal(rec);
            container.appendChild(div);
        });
    } catch (error) {
        container.innerHTML = '<p>Error loading recommendations.</p>';
    }
}

function closeModal() {
    const modal = document.getElementById('movieModal');
    modal.classList.remove('active');
    document.getElementById('modalBody').innerHTML = '';
}

function openYouTubeSearchInPage(movieTitle) {
    const searchTerm = movieTitle || document.getElementById('searchInput')?.value.trim();
    if (searchTerm) {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}+trailer`, '_self');
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const modalClose = document.getElementById('modalClose');
    const dropdown = document.getElementById('recentSearchesDropdown');
    const clearBtn = document.getElementById('clearSearchesBtn');

    // Debounced Search Input
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = e.target.value.trim();
            renderAggregatorRows();
        }, 300); // 300ms debounce
    });

    // Save search on blur
    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (dropdown && !dropdown.contains(document.activeElement)) {
                dropdown.classList.add('hidden');
                
                // Save the current search if it is a meaningful length
                if (currentSearch && currentSearch.length > 2) {
                    saveSearch(currentSearch);
                }
            }
        }, 200);
    });

    searchInput.addEventListener('focus', () => {
        if (dropdown) {
            renderRecentSearches();
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.setItem('recent_searches', '[]');
            renderRecentSearches();
            // Not sending full wipe to backend for simplicity here, just clear local list immediately visible
        });
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('movieModal')) closeModal();
    });
}

function saveSearch(term) {
    let searches = JSON.parse(localStorage.getItem('recent_searches') || '[]');
    // Remove if exists
    searches = searches.filter(s => s.toLowerCase() !== term.toLowerCase());
    searches.unshift(term);
    if (searches.length > 10) searches.pop();
    localStorage.setItem('recent_searches', JSON.stringify(searches));
    
    // Sync to backend using the fake movie object approach
    postActivity('search', { id: 'search_' + term, title: term });
}

function renderRecentSearches() {
    const list = document.getElementById('rsList');
    const dropdown = document.getElementById('recentSearchesDropdown');
    if (!list || !dropdown) return;

    let searches = JSON.parse(localStorage.getItem('recent_searches') || '[]');
    
    if (searches.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    dropdown.classList.remove('hidden');
    list.innerHTML = '';
    
    searches.forEach(term => {
        const li = document.createElement('li');
        li.className = 'rs-item';
        li.innerHTML = `
            <i class="fas fa-history"></i>
            <span>${term}</span>
            <span class="rs-item-remove" data-term="${term}"><i class="fas fa-times"></i></span>
        `;
        
        // Click to search
        li.addEventListener('click', (e) => {
            if (e.target.closest('.rs-item-remove')) return;
            document.getElementById('searchInput').value = term;
            currentSearch = term;
            renderAggregatorRows();
            dropdown.classList.add('hidden');
            saveSearch(term); // Bump to top
        });

        // Click delete
        const removeBtn = li.querySelector('.rs-item-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                searches = searches.filter(s => s !== term);
                localStorage.setItem('recent_searches', JSON.stringify(searches));
                deleteActivity('search', { id: 'search_' + term, title: term });
                renderRecentSearches();
            });
        }
        
        list.appendChild(li);
    });
}

// ── New Releases ─────────────────────────────────────────────────────────────
let _nrCurrentLang = 'all';
let _nrAutoRefreshTimer = null;

async function loadNewReleases(lang = 'all') {
    _nrCurrentLang = lang;
    const slider = document.getElementById('nrSlider');
    if (!slider) return;

    slider.innerHTML = `<div class="nr-loading"><div class="cinematic-loader"></div><p>Loading new releases…</p></div>`;

    try {
        const res = await fetch(`/api/new-releases?lang=${encodeURIComponent(lang)}&limit=60`);
        const movies = await res.json();
        renderNRCards(slider, movies);
        setNRTimestamp();
    } catch (e) {
        slider.innerHTML = `<p style="color:var(--text-dim);padding:1rem;">Could not load releases. <a href="#" onclick="loadNewReleases('${lang}');return false;" style="color:var(--accent-gold)">Retry</a></p>`;
    }
}

function renderNRCards(slider, movies) {
    if (!movies || movies.length === 0) {
        slider.innerHTML = `<p style="color:var(--text-dim);padding:1rem;">No movies found. Try refreshing!</p>`;
        return;
    }

    slider.innerHTML = '';
    const currentYear = new Date().getFullYear();

    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'nr-card';
        
        const isUpcoming = movie.is_upcoming === 1 || movie.is_upcoming === true;
        const is2026 = movie.release_year === 2026;
        const isNew = !isUpcoming && movie.release_year && movie.release_year >= currentYear - 1;
        const langClass = movie.language === 'Hindi' ? 'nr-badge-hindi' : 'nr-badge-english';
        const langLabel = movie.language === 'Hindi' ? '🇮🇳 Hindi' : '🇺🇸 English';

        const inWatchlist = isInWatchlist(movie.id || movie.title);
        const movieData = JSON.stringify(movie).replace(/"/g, '&quot;');
        const hasImage = movie.image_url && movie.image_url.trim() !== '' && movie.image_url !== 'N/A';

        // Build badge stack

        let badges = `<span class="nr-card-badge ${langClass}" style="top:6px">${langLabel}</span>`;
        if (isUpcoming) {
            badges += `<span class="nr-card-badge nr-badge-upcoming" style="top:30px">🚀 UPCOMING</span>`;
        } else if (is2026) {
            badges += `<span class="nr-card-badge nr-badge-new" style="top:30px">✨ 2026</span>`;
        } else if (isNew) {
            badges += `<span class="nr-card-badge nr-badge-new" style="top:30px">NEW</span>`;
        }

        card.innerHTML = `
            <button class="watchlist-btn nr-watchlist-btn ${inWatchlist ? 'active' : ''}" 
                    onclick="toggleWatchlist(event, this)" 
                    data-movie="${movieData}">
                <i class="fas fa-heart"></i>
            </button>
            <div class="movie-poster-container-rel ${!hasImage ? 'use-fallback' : ''}" style="position:relative;">
                ${hasImage ? `
                    <img class="nr-card-poster"
                         src="${movie.image_url}"
                         alt="${movie.title}"
                         loading="lazy"
                         decoding="async"
                         onload="validateImageSize(this)"
                         onerror="handlePosterError(this, '${(movie.title || '').replace(/'/g, "\\'")}')">
                ` : ''}
                <div class="poster-fallback-text" style="position:absolute; inset:0; align-items:center; justify-content:center; padding:10px; font-size:0.7rem;">${movie.title}</div>
            </div>
            ${badges}


            ${movie.release_year ? `<span class="nr-card-year">${movie.release_year}</span>` : ''}
            <div class="nr-card-title">${movie.title}</div>
            <div class="nr-card-meta">${movie.genre || ''}</div>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.closest('.watchlist-btn')) return;
            addToHistory(movie);
            openMovieModal(movie);
        });
        slider.appendChild(card);
    });
}



function switchNRTab(btn, lang) {
    document.querySelectorAll('.nr-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loadNewReleases(lang);
}

function slideNR(dir) {
    const slider = document.getElementById('nrSlider');
    if (slider) slider.scrollBy({ left: dir * 600, behavior: 'smooth' });
}

async function refreshNewReleases() {
    const btn = document.getElementById('nrRefreshBtn');
    const icon = document.getElementById('nrRefreshIcon');
    const updated = document.getElementById('nrLastUpdated');

    if (btn) btn.classList.add('spinning');
    if (updated) updated.textContent = 'Refreshing live data…';

    try {
        const res = await fetch('/api/new-releases/refresh');
        const data = await res.json();
        const slider = document.getElementById('nrSlider');
        if (slider && data.movies) {
            const filtered = _nrCurrentLang === 'all'
                ? data.movies
                : data.movies.filter(m => m.language === _nrCurrentLang);
            renderNRCards(slider, filtered);
        }
        if (updated) {
            const newCount = data.added > 0 ? ` (+${data.added} new)` : '';
            setNRTimestamp(newCount);
        }
    } catch (e) {
        if (updated) updated.textContent = 'Refresh failed — try again';
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}

function setNRTimestamp(extra = '') {
    const el = document.getElementById('nrLastUpdated');
    if (!el) return;
    const now = new Date();
    el.textContent = `Updated ${now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}${extra}`;
}

// Auto-refresh every 5 minutes
function startNRAutoRefresh() {
    if (_nrAutoRefreshTimer) clearInterval(_nrAutoRefreshTimer);
    _nrAutoRefreshTimer = setInterval(() => refreshNewReleases(), 5 * 60 * 1000);
}

function scrollToMyMovies() {
    // Reset filters to show the My Movies row
    currentGenre = 'all';
    currentProvider = 'all';
    currentSearch = '';
    
    // Clear UI active states
    document.querySelectorAll('.genre-card').forEach(c => c.classList.remove('active-genre'));
    document.querySelectorAll('.provider-item').forEach(i => {
        i.classList.remove('active');
        if (i.dataset.provider === 'all') i.classList.add('active');
    });
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    renderAggregatorRows();
    
    setTimeout(() => {
        const rows = document.getElementById('movie-rows-container');
        if (rows) rows.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
}

// ── Personalized Sections Logic (LocalStorage + Backend Sync) ────────────────────────────────

let isUserLoggedIn = true;

async function syncUserActivity() {
    try {
        const histRes = await fetch('/api/user_activity?type=history');
        if (histRes.status === 401) {
            isUserLoggedIn = false;
            return;
        }
        if (histRes.ok) {
            const hist = await histRes.json();
            localStorage.setItem('movie_history', JSON.stringify(hist));
        }

        const watchRes = await fetch('/api/user_activity?type=watchlist');
        if (watchRes.ok) {
            const watch = await watchRes.json();
            localStorage.setItem('my_movies', JSON.stringify(watch));
        }

        const searchRes = await fetch('/api/user_activity?type=search');
        if (searchRes.ok) {
            const searchMovies = await searchRes.json();
            // Convert back to simple string array
            const searches = searchMovies.map(m => m.title);
            localStorage.setItem('recent_searches', JSON.stringify(searches));
        }
    } catch(e) { console.error('Activity sync failed', e); }
}

async function postActivity(type, movie) {
    if (!isUserLoggedIn) return;
    try {
        await fetch('/api/user_activity', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({type, movie})
        });
    } catch(e) {}
}

async function deleteActivity(type, movie) {
    if (!isUserLoggedIn) return;
    try {
        await fetch('/api/user_activity', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type, 
                movie_id: movie.id || movie.title
            })
        });
    } catch(e) {}
}

function getWatchlist() {
    return JSON.parse(localStorage.getItem('my_movies') || '[]');
}

function getHistory() {
    return JSON.parse(localStorage.getItem('movie_history') || '[]');
}

function isInWatchlist(movieId) {
    const watchlist = getWatchlist();
    return watchlist.some(m => (m.id || m.title) === movieId);
}

function toggleWatchlist(event, btn) {
    event.stopPropagation();
    const movie = JSON.parse(btn.dataset.movie);
    const movieId = movie.id || movie.title;
    let watchlist = getWatchlist();
    
    const index = watchlist.findIndex(m => (m.id || m.title) === movieId);
    if (index > -1) {
        watchlist.splice(index, 1);
        btn.classList.remove('active');
        deleteActivity('watchlist', movie);
    } else {
        watchlist.unshift(movie);
        btn.classList.add('active');
        postActivity('watchlist', movie);
    }
    
    localStorage.setItem('my_movies', JSON.stringify(watchlist));
}

function addToHistory(movie) {
    let history = getHistory();
    const movieId = movie.id || movie.title;
    
    // Remove if already exists to move to top
    history = history.filter(m => (m.id || m.title) !== movieId);
    history.unshift(movie);
    
    // Cap at 20 items
    if (history.length > 20) history.pop();
    
    localStorage.setItem('movie_history', JSON.stringify(history));
    postActivity('history', movie);
}

// ── Trending Now ─────────────────────────────────────────────────────────────
async function loadTrending() {
    const slider = document.getElementById('trendingSlider');
    if (!slider) return;

    try {
        const res = await fetch('/api/trending?limit=20');
        const movies = await res.json();
        
        if (!movies.length) {
            slider.innerHTML = '<p style="color:var(--text-dim);padding:1rem;">No trending movies found.</p>';
            return;
        }

        slider.innerHTML = '';
        movies.forEach((movie, i) => {
            const card = document.createElement('div');
            card.className = 'trending-card';
            const hasImage = movie.image_url && movie.image_url.startsWith('http');
            card.innerHTML = `
                <span class="trending-card-rank">${i + 1}</span>
                ${hasImage ? `<img src="${movie.image_url}" alt="${movie.title}" loading="lazy" onerror="handlePosterError(this, '${(movie.title||'').replace(/'/g,"\\'")}')" >` : 
                `<div style="width:100%;height:270px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;padding:1rem;color:var(--accent-gold);font-weight:700;font-size:0.85rem;text-align:center;">${movie.title}</div>`}
                <div class="trending-card-overlay">
                    <div class="trending-card-title">${movie.title}</div>
                    <div class="trending-card-meta">${movie.genre || ''} • ${movie.language || ''}</div>
                </div>
            `;
            card.addEventListener('click', () => { addToHistory(movie); openMovieModal(movie); });
            slider.appendChild(card);
        });
    } catch (e) {
        slider.innerHTML = '<p style="color:var(--text-dim);padding:1rem;">Could not load trending.</p>';
    }
}

function removeFromList(type, movie) {
    if (type === 'Recently Viewed') {
        let history = getHistory();
        history = history.filter(m => (m.id || m.title) !== (movie.id || movie.title));
        localStorage.setItem('movie_history', JSON.stringify(history));
        deleteActivity('history', movie);
    } else if (type === 'My Movies') {
        let watchlist = getWatchlist();
        watchlist = watchlist.filter(m => (m.id || m.title) !== (movie.id || movie.title));
        localStorage.setItem('my_movies', JSON.stringify(watchlist));
        deleteActivity('watchlist', movie);
    }
    renderAggregatorRows();
}

// ── Navigation Helpers ───────────────────────────────────────────────────
function scrollToTrending() {
    const s = document.getElementById('trendingSection');
    if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scrollToMyMovies() {
    renderAggregatorRows(); // Refresh first
    setTimeout(() => {
        const rows = document.querySelectorAll('.movie-row');
        for (let row of rows) {
            if (row.querySelector('.row-header')?.textContent === 'My Movies') {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
        // Fallback to row container
        document.getElementById('movie-rows-container').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function focusSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => input.focus(), 500);
    }
}
