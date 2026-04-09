from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
from flask_bcrypt import Bcrypt
import sqlite3
import os
import json
import urllib.request
import urllib.parse
from functools import wraps
import random
from metadata_config import VERIFIED_POSTERS, VERIFIED_TRAILERS
app = Flask(__name__)
app.secret_key = 'your-secret-key-change-in-production'
bcrypt = Bcrypt(app)

DATABASE = 'movies.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Speed pragmas: WAL mode + in-memory temp store
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA cache_size=-8000')  # 8 MB page cache
    conn.execute('PRAGMA synchronous=NORMAL')
    return conn

# ── Startup: create indexes for fast filtering ─────────────────────────────
def _create_indexes():
    conn = get_db_connection()
    conn.execute('CREATE INDEX IF NOT EXISTS idx_genre      ON movies(genre)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_language   ON movies(language)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_year       ON movies(release_year)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_upcoming   ON movies(is_upcoming)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_lang_year  ON movies(language, release_year)')
    conn.commit()
    conn.close()

# ── Simple in-memory cache (avoids repeated full-table scans) ──────────────
import time as _time_module
_movies_cache = {'data': None, 'ts': 0, 'ttl': 60}  # refresh every 60s

def _invalidate_movie_cache():
    _movies_cache['data'] = None
    _movies_cache['ts'] = 0

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    
    # Create user activity (history and watchlist) table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            activity_type TEXT NOT NULL,
            movie_id TEXT NOT NULL,
            movie_data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Create movies table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            genre TEXT NOT NULL,
            language TEXT NOT NULL,
            image_url TEXT NOT NULL,
            youtube_link TEXT NOT NULL,
            artwork_source TEXT
        )
    ''')
    
    # Check if movies table is empty, then seed data
    cursor.execute('SELECT COUNT(*) FROM movies')
    if cursor.fetchone()[0] == 0:
        movies = [
            # English Movies - Classics & Modern
            ('Nosferatu', 'Horror', 'English', 'https://m.media-amazon.com/images/M/MV5BMTAxYjEyMTctZTg3Ni00MGZmLWIxMmMtOGFhNDY4NDM2YzY3XkEyXkFqcGdeQXVyNjc1NTYyMjg@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=FC6biTjEyZw'),
            ('Metropolis', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/M/MV5BMjEyOTkyODIzNV5BMl5BanBnXkFtZTcwNzI2NDQ2Mw@@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=Q0uAL4vQ3DE'),
            ('The Great Dictator', 'Comedy', 'English', 'https://m.media-amazon.com/images/M/MV5BMmExYWJjNTktNGUyZS00ODhmLTkxYzAtNWM1OTU2ZjFmZDhmXkEyXkFqcGdeQXVyNTA4NzY1MzY@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=J7GY1Xg6X20'),
            ('Interstellar', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/91kFYSe4HuL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=zSWdZVtXT7E'),
            ('The Dark Knight', 'Action', 'English', 'https://m.media-amazon.com/images/I/91EB8vF+8pL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=EXeTwQWaywY'),
            ('Inception', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/912AErFSBHL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=YoHD9XEInc0'),
            ('Pulp Fiction', 'Crime', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=s7EdQ4FqbhY'),
            ('The Shawshank Redemption', 'Drama', 'English', 'https://m.media-amazon.com/images/I/519NBNHX5LL._AC_.jpg', 'https://www.youtube.com/watch?v=6hB3S9bIaco'),
            ('The Godfather', 'Crime', 'English', 'https://m.media-amazon.com/images/I/71YvE6j2ZXL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=sY1S34973zA'),
            ('Matrix', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/51EG732BV3L._AC_.jpg', 'https://www.youtube.com/watch?v=vKQi3bBA1y8'),
            ('Forrest Gump', 'Drama', 'English', 'https://m.media-amazon.com/images/I/8170SIn693L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=bLvqoHBptjg'),
            ('Gladiator', 'Action', 'English', 'https://m.media-amazon.com/images/I/51A9-YvI+hL._AC_.jpg', 'https://www.youtube.com/watch?v=ol67qoK77mI'),
            ('The Lion King', 'Animation', 'English', 'https://m.media-amazon.com/images/I/81B5mS6UvBL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=lFzVjeohZg0'),
            ('Avengers: Endgame', 'Action', 'English', 'https://m.media-amazon.com/images/I/81Ex7HS7EWL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=TcMBFSGVi1c'),
            ('Joker', 'Drama', 'English', 'https://m.media-amazon.com/images/I/71X8k+-sYXL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=zAGVQLHvwOY'),
            ('Parasite', 'Thriller', 'Korean', 'https://m.media-amazon.com/images/I/91TfP9+SByL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=5xH0HfJHsaY'),
            ('Spirited Away', 'Animation', 'Japanese', 'https://m.media-amazon.com/images/I/91pYI5A-W5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=ByXuk9QqQkk'),
            
            # Hindi Movies
            ('Sholay', 'Action', 'Hindi', 'https://m.media-amazon.com/images/I/81vS2S-U52L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=hLhN8R4E_1Q'),
            ('Dilwale Dulhania Le Jayenge', 'Romantic', 'Hindi', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=c25GKl5VNeQ'),
            ('3 Idiots', 'Comedy', 'Hindi', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=K0eDa49QH6s'),
            ('Dangal', 'Drama', 'Hindi', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=x_7YlGv9u1g'),
            ('Lagaan', 'Drama', 'Hindi', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=NyeXGdgU32U'),
            ('PK', 'Comedy', 'Hindi', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=82Z59V67_60'),
            ('Gangs of Wasseypur', 'Crime', 'Hindi', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=j-AkWDkXcMY'),
            ('Andhadhun', 'Thriller', 'Hindi', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=2iVYI99VGaw'),
            ('Drishyam', 'Thriller', 'Hindi', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=AuuX2j14NBg'),
            ('Bajrangi Bhaijaan', 'Drama', 'Hindi', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=vyX4fJCHNo8'),
            ('Baahubali', 'Action', 'Telugu', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=sOEg_YZ768Y'),
            ('RRR', 'Action', 'Telugu', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=NgBoMJy386M'),
            ('KGF', 'Action', 'Kannada', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=qXgBeL66D-A'),
            ('Kantara', 'Action', 'Kannada', 'https://m.media-amazon.com/images/I/91vXjS9B-3L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=84Im_p9XU-M'),
            ('Pushpa', 'Action', 'Telugu', 'https://m.media-amazon.com/images/I/81Mclit6L5L._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=pKctjlB1rXQ'),
            
            # Additional Action
            ('Mad Max: Fury Road', 'Action', 'English', 'https://m.media-amazon.com/images/I/91kFYSe4HuL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=hEJnMQG9ev8'),
            ('John Wick', 'Action', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=c076P730sO8'),
            ('Mission Impossible', 'Action', 'English', 'https://m.media-amazon.com/images/I/71YvE6j2ZXL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=vVIsTh4mPrg'),
            
            # Additional Sci-Fi
            ('Blade Runner 2049', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=gCcx85zbxz4'),
            ('Arrival', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/71YvE6j2ZXL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=gwqSi_ToNPs'),
            ('The Martian', 'Sci-Fi', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=ej3ioOneTy8'),
            
            # Additional Horror
            ('The Conjuring', 'Horror', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=k10ETZ41q5o'),
            ('Get Out', 'Horror', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=DzfpyWbqWgw'),
            ('A Quiet Place', 'Horror', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=WR7cc5t7tv8'),
            
            # Additional Romance
            ('The Notebook', 'Romantic', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=S3G3fniK_80'),
            ('La La Land', 'Romantic', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=0pdqf4P9MB8'),
            ('Titanic', 'Romantic', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=2e-eXJ6HgkQ'),
            
            # Additional Comedy
            ('The Hangover', 'Comedy', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=tcdUhdOlz9M'),
            ('Superbad', 'Comedy', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=RPrfO6uC4qI'),
            ('Step Brothers', 'Comedy', 'English', 'https://m.media-amazon.com/images/I/81UTs3sC5hL._AC_SL1500_.jpg', 'https://www.youtube.com/watch?v=CewglxElBK0'),
        ]
        cursor.executemany('''
            INSERT INTO movies (title, genre, language, image_url, youtube_link)
            VALUES (?, ?, ?, ?, ?)
        ''', movies)
    
    conn.commit()
    conn.close()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user and bcrypt.check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            flash('Login successful!', 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password', 'error')
    
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            flash('Passwords do not match', 'error')
            return render_template('signup.html')
        
        if len(password) < 6:
            flash('Password must be at least 6 characters', 'error')
            return render_template('signup.html')
        
        conn = get_db_connection()
        try:
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            conn.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                        (username, email, hashed_password))
            conn.commit()
            conn.close()
            flash('Registration successful! Please login.', 'success')
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            flash('Username or email already exists', 'error')
            conn.close()
    
    return render_template('signup.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out', 'info')
    return redirect(url_for('index'))

@app.route('/api/user_activity', methods=['GET'])
def get_user_activity():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    activity_type = request.args.get('type', 'history')
    conn = get_db_connection()
    # Order by most recent for both
    rows = conn.execute(
        'SELECT movie_data FROM user_activity WHERE user_id = ? AND activity_type = ? ORDER BY created_at DESC',
        (session['user_id'], activity_type)
    ).fetchall()
    conn.close()
    
    movies = []
    for r in rows:
        try:
            movies.append(json.loads(r['movie_data']))
        except Exception:
            pass
    return jsonify(movies)

@app.route('/api/user_activity', methods=['POST'])
def add_user_activity():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    activity_type = data.get('type')
    movie = data.get('movie')
    if not activity_type or not movie:
        return jsonify({'error': 'Bad Request'}), 400
        
    movie_id = str(movie.get('id') or movie.get('title'))
    movie_data = json.dumps(movie)
    
    conn = get_db_connection()
    # Remove existing entry if it exists to move it to top
    conn.execute(
        'DELETE FROM user_activity WHERE user_id = ? AND activity_type = ? AND movie_id = ?',
        (session['user_id'], activity_type, movie_id)
    )
    # Insert new entry
    conn.execute(
        'INSERT INTO user_activity (user_id, activity_type, movie_id, movie_data) VALUES (?, ?, ?, ?)',
        (session['user_id'], activity_type, movie_id, movie_data)
    )
    # Cap history at 20 items per user
    if activity_type == 'history':
        conn.execute('''
            DELETE FROM user_activity WHERE id IN (
                SELECT id FROM user_activity 
                WHERE user_id = ? AND activity_type = 'history'
                ORDER BY created_at DESC LIMIT -1 OFFSET 20
            )
        ''', (session['user_id'],))
        
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/user_activity', methods=['DELETE'])
def remove_user_activity():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    activity_type = data.get('type')
    movie_id = data.get('movie_id')
    
    if not activity_type or not movie_id:
        return jsonify({'error': 'Bad Request'}), 400
        
    conn = get_db_connection()
    conn.execute(
        'DELETE FROM user_activity WHERE user_id = ? AND activity_type = ? AND movie_id = ?',
        (session['user_id'], activity_type, str(movie_id))
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/movies')
def get_movies():
    genre    = request.args.get('genre')
    language = request.args.get('language')
    search   = request.args.get('search')
    page     = max(1, int(request.args.get('page',  1)))
    limit    = min(300, int(request.args.get('limit', 300)))
    offset   = (page - 1) * limit

    # ── Serve from cache when no filters are applied ──────────────────────
    no_filter = not genre and not language and not search
    now = _time_module.time()
    if no_filter and _movies_cache['data'] and (now - _movies_cache['ts']) < _movies_cache['ttl']:
        start = offset
        end   = offset + limit
        return jsonify(_movies_cache['data'][start:end])

    conn = get_db_connection()
    # Only fetch the columns the frontend actually needs
    query  = 'SELECT id, title, genre, language, image_url, youtube_link, release_year, is_upcoming FROM movies WHERE 1=1'
    params = []

    if genre:
        query += ' AND genre = ?'
        params.append(genre)
    if language:
        query += ' AND language = ?'
        params.append(language)
    if search:
        query += ' AND title LIKE ?'
        params.append(f'%{search}%')

    query += ' ORDER BY id DESC'

    if no_filter:
        # Load ALL into cache, then slice
        rows = conn.execute(query, params).fetchall()
        conn.close()
        all_movies = []
        for r in rows:
            m = dict(r)
            all_movies.append(m)
        _movies_cache['data'] = all_movies
        _movies_cache['ts']   = now
        return jsonify(all_movies[offset : offset + limit])
    else:
        query += ' LIMIT ? OFFSET ?'
        params += [limit, offset]
        rows = conn.execute(query, params).fetchall()
        conn.close()
        results = []
        for r in rows:
            m = dict(r)
            results.append(m)
        return jsonify(results)


@app.route('/api/genres')
def get_genres():
    conn = get_db_connection()
    genres = conn.execute('SELECT DISTINCT genre FROM movies').fetchall()
    conn.close()
    return jsonify([g['genre'] for g in genres])

@app.route('/api/languages')
def get_languages():
    conn = get_db_connection()
    languages = conn.execute('SELECT DISTINCT language FROM movies').fetchall()
    conn.close()
    return jsonify([l['language'] for l in languages])

def calculate_jaccard_similarity(set1, set2):
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return float(intersection) / union

@app.route('/api/recommendations/<int:movie_id>')
def get_recommendations(movie_id):
    conn = get_db_connection()
    # Get the target movie
    target_movie = conn.execute('SELECT * FROM movies WHERE id = ?', (movie_id,)).fetchone()
    
    if not target_movie:
        conn.close()
        return jsonify([])
    
    # Get all other movies
    all_movies = conn.execute('SELECT * FROM movies WHERE id != ?', (movie_id,)).fetchall()
    conn.close()
    
    target_genres = set(target_movie['genre'].split(', '))
    
    similarities = []
    for movie in all_movies:
        movie_genres = set(movie['genre'].split(', '))
        similarity = calculate_jaccard_similarity(target_genres, movie_genres)
        
        # Boost similarity if it's the same language
        if movie['language'] == target_movie['language']:
            similarity += 0.2
            
        similarities.append({
            'movie': dict(movie),
            'similarity': similarity
        })
    
    # Sort by similarity and return top 5
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    return jsonify([s['movie'] for s in similarities[:5]])

# --- Hero Section Dynamic Endpoint ---
@app.route('/api/hero')
def get_hero():
    """Return a randomly selected featured movie for the hero/billboard section."""
    conn = get_db_connection()
    # Prioritize popular English/Hindi movies with confirmed video IDs
    hero_movie = conn.execute(
        """SELECT * FROM movies 
           WHERE youtube_link LIKE '%watch?v=%'
           ORDER BY RANDOM() LIMIT 1"""
    ).fetchone()
    
    # Fallback: any movie
    if not hero_movie:
        hero_movie = conn.execute('SELECT * FROM movies ORDER BY RANDOM() LIMIT 1').fetchone()
    
    conn.close()
    
    if hero_movie:
        return jsonify(dict(hero_movie))
    return jsonify({'title': 'CineArtistry', 'genre': 'All Genres', 'language': 'Various',
                    'image_url': '', 'youtube_link': ''})

# --- Trailer Search via yt-dlp ---
_trailer_cache = {}

@app.route('/api/search-trailer')
def search_trailer():
    """Search YouTube for a trailer and return the direct video ID."""
    title = request.args.get('title', '')
    if not title:
        return jsonify({'error': 'No title provided'}), 400

    # Return cached result if available
    if title in _trailer_cache:
        return jsonify({'video_id': _trailer_cache[title]})

    try:
        from yt_dlp import YoutubeDL
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(
                f"ytsearch1:{title} official trailer",
                download=False
            )
            if result and result.get('entries'):
                video_id = result['entries'][0].get('id', '')
                if video_id:
                    _trailer_cache[title] = video_id
                    return jsonify({'video_id': video_id})
    except Exception as e:
        print(f"yt-dlp search error for '{title}': {e}")

    return jsonify({'video_id': None})

# --- New Releases API ---
def _ensure_release_year_column():
    """Add release_year, is_upcoming, and is_trending columns if they don't exist."""
    conn = get_db_connection()
    cols = [c[1] for c in conn.execute("PRAGMA table_info(movies)").fetchall()]
    if 'release_year' not in cols:
        conn.execute("ALTER TABLE movies ADD COLUMN release_year INTEGER DEFAULT 0")
    if 'is_upcoming' not in cols:
        conn.execute("ALTER TABLE movies ADD COLUMN is_upcoming INTEGER DEFAULT 0")
    if 'is_trending' not in cols:
        conn.execute("ALTER TABLE movies ADD COLUMN is_trending INTEGER DEFAULT 0")
    if 'in_cinemas' not in cols:
        conn.execute("ALTER TABLE movies ADD COLUMN in_cinemas INTEGER DEFAULT 0")
    conn.commit()
    conn.close()

_ensure_release_year_column()

# ── Seed current Hindi cinema hall movies (March 2025) ──────────────────────
def _seed_hindi_cinema_releases():
    """Seed currently running Hindi movies in cinema halls (March 2025)."""
    conn = get_db_connection()
    existing = set(r[0].lower() for r in conn.execute('SELECT title FROM movies').fetchall())

    CINEMA_MOVIES = [
        ('Sikandar Ka Muqaddar', 'Thriller', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BNTk3NTcwZjEtY2M1Zi00ZWI2LWJlZjgtNzg5NWM5OGZjZjFkXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=rDAJJ7t-0Mo', 2025, 1, 1),
        ('Chhaava', 'Historical', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BOGRhMjI0OTYtNDliNC00ZjFjLTlmMjUtOWVhOTBjOWQzY2IxXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=F99TfHJC3Ao', 2025, 1, 1),
        ('Deva', 'Action', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BODEyMzI1MmItNDhjYi00OGY0LWIyNzQtZWFlNjA1NGFmZTdlXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=PLACEHOLDER_DEVA', 2025, 1, 1),
        ('Mere Husband Ki Shaadi', 'Comedy', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BYmRiMDA2MzgtMmMwMC00ZmI4LTk0OTMtOWUxNTJhNWI5MjdhXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
        ('Thama', 'Horror', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BYWI0NGI5OGUtZjA4Ny00ZWI3LWI4M2UtNmUxNWVjNTdlNDNhXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
        ('Sky Force', 'Action', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BNzZhZjE3NzEtNmEyOS00ZDJhLTllMmQtYTQ3OThjNTRhYzRhXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=_KfSDIrnGFE', 2025, 1, 1),
        ('Baaghi 4', 'Action', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BOWM2NjljMDEtYjBkMi00NmVjLTk1OGYtOTMzYTQ1ZGRhYjRiXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
        ('Housefull 5', 'Comedy', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BNWY2YTAxMzEtZjIzMC00YjVlLTk1OTctZjE4ZWM3YmQzNGFmXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
        ('De De Pyaar De 2', 'Romance', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BY2VhMzUwOTYtYmU5YS00YTg5LTlkZjgtNjIyZjk0YmYwZGJjXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
        ('Jolly LLB 3', 'Comedy', 'Hindi', 'https://m.media-amazon.com/images/M/MV5BMjlhNWYzNjAtMzBmMS00NjU3LTk2NjYtYjlhZWY3NjI0M2NkXkEyXkFqcGc@._V1_SX300.jpg', 'https://www.youtube.com/watch?v=', 2025, 1, 1),
    ]

    added = 0
    for title, genre, lang, poster, yt, year, trending, cinema in CINEMA_MOVIES:
        # Use verified poster if available
        final_poster = VERIFIED_POSTERS.get(title, poster)
        
        if title.lower() not in existing:
            conn.execute(
                "INSERT INTO movies (title, genre, language, image_url, youtube_link, artwork_source, release_year, is_trending, in_cinemas) VALUES (?,?,?,?,?,?,?,?,?)",
                (title, genre, lang, final_poster, yt, 'Verified Poster', year, trending, cinema)
            )
            existing.add(title.lower())
            added += 1
        else:
            # Force update poster for existing cinema movies to ensure new stable URLs are used
            conn.execute(
                "UPDATE movies SET image_url = ?, in_cinemas = 1, is_trending = ? WHERE title = ?",
                (final_poster, trending, title)
            )
    
    # Also mark some popular existing movies as trending
    trending_titles = [
        'Pathaan', 'Jawan', 'Stree 2', 'Kalki 2898 AD', 'Pushpa 2: The Rule',
        'Sikandar Ka Muqaddar', 'Chhaava', 'Deva', 'Thama', 'Baaghi 4',
        'Oppenheimer', 'Dune: Part Two', 'Deadpool & Wolverine', 'Inside Out 2',
        'Interstellar', 'The Dark Knight', 'Inception'
    ]
    for t in trending_titles:
        conn.execute("UPDATE movies SET is_trending = 1 WHERE title = ?", (t,))
    
    conn.commit()
    conn.close()
    if added > 0:
        print(f"Seeded {added} Hindi cinema releases (2025)")

try:
    _seed_hindi_cinema_releases()
except Exception as e:
    print(f"Cinema seed warning: {e}")
_new_releases_cache = {'data': None, 'ts': 0}

@app.route('/api/new-releases')
def new_releases():
    """Return recent Hindi & English movies. lang=Hindi|English|all|upcoming"""
    language = request.args.get('lang', 'all')
    limit = int(request.args.get('limit', 60))

    conn = get_db_connection()

    if language == 'upcoming':
        rows = conn.execute(
            """SELECT * FROM movies WHERE is_upcoming = 1 AND language IN ('Hindi','English')
               ORDER BY release_year DESC, id DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    elif language == 'all':
        rows = conn.execute(
            """SELECT * FROM movies WHERE language IN ('Hindi','English')
               AND release_year >= 2022
               ORDER BY is_upcoming ASC, release_year DESC, id DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM movies WHERE language = ?
               AND release_year >= 2022
               ORDER BY is_upcoming ASC, release_year DESC, id DESC LIMIT ?""",
            (language, limit)
        ).fetchall()

    conn.close()
    results = []
    for r in rows:
        m = dict(r)
        results.append(m)
    return jsonify(results)


@app.route('/api/trending')
def get_trending():
    """Return trending movies."""
    limit = int(request.args.get('limit', 20))
    conn = get_db_connection()
    rows = conn.execute(
        """SELECT id, title, genre, language, image_url, youtube_link, release_year, is_upcoming
           FROM movies WHERE is_trending = 1
           ORDER BY RANDOM() LIMIT ?""",
        (limit,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/now-in-cinemas')
def now_in_cinemas():
    """Return Hindi movies currently in cinema halls."""
    conn = get_db_connection()
    rows = conn.execute(
        """SELECT id, title, genre, language, image_url, youtube_link, release_year
           FROM movies WHERE in_cinemas = 1
           ORDER BY id DESC"""
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/new-releases/refresh')
def refresh_new_releases():
    """
    Live refresh: fetch the very latest movies from OMDB (2024-2025)
    and upsert them into the DB, then return the updated list.
    """
    import time as _time
    searches = [
        ('Hindi', ['hindi 2024', 'bollywood 2024', 'hindi film 2025', 'bollywood 2025']),
        ('English', ['english film 2024', 'english movie 2025', 'hollywood 2024', 'hollywood 2025']),
    ]
    conn = get_db_connection()
    cols = [c[1] for c in conn.execute("PRAGMA table_info(movies)").fetchall()]
    if 'release_year' not in cols:
        conn.execute("ALTER TABLE movies ADD COLUMN release_year INTEGER DEFAULT 0")
        conn.commit()

    existing = set(r[0].lower() for r in conn.execute('SELECT title FROM movies').fetchall())
    added = 0

    for lang, terms in searches:
        for term in terms:
            try:
                url = f"https://www.omdbapi.com/?s={urllib.parse.quote(term)}&type=movie&apikey={OMDB_API_KEY}&page=1"
                with urllib.request.urlopen(url, timeout=6) as resp:
                    data = json.loads(resp.read().decode())
                    for m in data.get('Search', []):
                        title = m.get('Title', '').strip()
                        year_str = m.get('Year', '0').replace('–', '').strip()
                        try:
                            year = int(year_str[:4])
                        except Exception:
                            year = 0
                        if not title or title.lower() in existing or year < 2022:
                            continue

                        poster = m.get('Poster', '')
                        if not poster or poster == 'N/A':
                            # Try precise title lookup
                            try:
                                t_url = f"https://www.omdbapi.com/?t={urllib.parse.quote(title)}&apikey={OMDB_API_KEY}"
                                with urllib.request.urlopen(t_url, timeout=3) as t_resp:
                                    t_data = json.loads(t_resp.read().decode())
                                    poster = t_data.get('Poster', '') if t_data.get('Poster') != 'N/A' else ''
                            except: pass

                        # Final Fallback: If still no poster, look for a YouTube Trailer Thumbnail
                        artwork_src = 'OMDB Live'
                        yt_link = ''
                        if not poster:
                            try:
                                from yt_dlp import YoutubeDL
                                with YoutubeDL({'quiet':True, 'extract_flat':True, 'no_warnings':True}) as ydl:
                                    yt_res = ydl.extract_info(f"ytsearch1:{title} official trailer", download=False)
                                    if yt_res.get('entries'):
                                        vid_id = yt_res['entries'][0].get('id')
                                        yt_link = f"https://www.youtube.com/watch?v={vid_id}"
                                        poster = f"https://img.youtube.com/vi/{vid_id}/maxresdefault.jpg"
                                        artwork_src = 'YouTube Metadata'
                            except: pass

                        if not poster: artwork_src = 'Fallback Text'

                        conn.execute(
                            "INSERT OR IGNORE INTO movies (title, genre, language, image_url, youtube_link, artwork_source, release_year) VALUES (?,?,?,?,?,?,?)",
                            (title, 'Movie', lang, poster, yt_link, artwork_src, year)
                        )

                        existing.add(title.lower())
                        added += 1

            except Exception as e:
                print(f"Refresh error for '{term}': {e}")

    conn.commit()

    # Return updated recent list
    rows = conn.execute(
        """SELECT * FROM movies WHERE language IN ('Hindi','English') AND release_year >= 2022
           ORDER BY release_year DESC, id DESC LIMIT 60"""
    ).fetchall()
    conn.close()
    return jsonify({'added': added, 'movies': [dict(r) for r in rows]})

# --- Static Pages Integration ---

@app.route('/privacy')
def privacy():
    return render_template('privacy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

# --- Real-Time External API Integration (OMDB) ---
# Using OMDB API for free original movie images without requiring an API key
OMDB_API_KEY = os.environ.get('OMDB_API_KEY', 'thewdb') # Default public key

@app.route('/api/search_external')
def search_external():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])

    try:
        # Search OMDB (Free API)
        encoded_query = urllib.parse.quote(query)
        url = f"https://www.omdbapi.com/?s={encoded_query}&apikey={OMDB_API_KEY}"
        
        with urllib.request.urlopen(url, timeout=5) as response:

            data = json.loads(response.read().decode())
            results = data.get('Search', [])
            
            # Format results to match our movie schema
            formatted_movies = []
            for m in results[:10]:
                poster_url = m.get('Poster', '')
                if poster_url == 'N/A' or not poster_url:
                    poster_url = '' 

                
                formatted_movies.append({
                    'id': m.get('imdbID'),
                    'title': m.get('Title'),
                    'genre': 'Movie', # OMDB search doesn't return genre
                    'language': 'English',
                    'image_url': poster_url,
                    'youtube_link': f"https://www.youtube.com/results?search_query={urllib.parse.quote(m.get('Title', '') + ' trailer')}",
                    'provider': 'netflix', # Default mock provider for visual consistency
                    'artwork_source': 'OMDB API (Free)'
                })
            
            # Fallback to local search if OMDB found nothing
            if not formatted_movies:
                conn = get_db_connection()
                movies = conn.execute('SELECT * FROM movies WHERE title LIKE ? LIMIT 10', (f'%{query}%',)).fetchall()
                conn.close()
                return jsonify([dict(m) for m in movies])
                
            return jsonify(formatted_movies)
    except Exception as e:
        print(f"OMDB API Error: {e}")
        # Fallback to local search on API failure
        conn = get_db_connection()
        movies = conn.execute('SELECT * FROM movies WHERE title LIKE ? LIMIT 10', (f'%{query}%',)).fetchall()
        conn.close()
        return jsonify([dict(m) for m in movies])

if __name__ == '__main__':
    init_db()
    _create_indexes()
    app.run(debug=True, threaded=True)


