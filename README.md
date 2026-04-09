# 🎬 Movie Recommender Website

A full-stack movie recommendation website with a beautiful 3D dark theme, featuring user authentication, dynamic filtering, and embedded YouTube trailers.

## ✨ Features

- **Beautiful 3D UI**: Dark night-mode theme with glowing hover effects and smooth transitions
- **User Authentication**: Secure login/signup system with password hashing
- **Movie Database**: Preloaded with 20+ real movies across multiple genres and languages
- **Dynamic Filtering**: Filter movies by genre and language without page reload
- **Search Functionality**: Search movies by name with instant results
- **YouTube Integration**: Click any movie to watch its trailer in an embedded player
- **Responsive Design**: Mobile-friendly layout that adapts to all screen sizes
- **Category Browsing**: Browse by genre (Romantic, Horror, Drama, Comedy, Action, Sci-Fi) and language (English, Hindi, Tamil, Telugu, Bangla)

## 🚀 Getting Started

### Prerequisites

- Python 3.7 or higher
- pip (Python package manager)

### Installation

1. **Clone or download this repository**

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:5000
   ```

## 📁 Project Structure

```
movie_recommender/
│
├── app.py                 # Flask backend application
├── movies.db              # SQLite database (created automatically)
├── requirements.txt       # Python dependencies
├── README.md             # This file
│
├── templates/            # HTML templates
│   ├── index.html       # Homepage
│   ├── login.html       # Login page
│   └── signup.html      # Signup page
│
└── static/              # Static files
    ├── css/
    │   └── style.css    # Main stylesheet
    ├── js/
    │   ├── main.js      # Main JavaScript logic
    │   └── auth.js      # Authentication validation
    └── images/          # Image assets
```

## 🎯 Usage

### For Users

1. **Browse Movies**: View featured and all movies on the homepage
2. **Search**: Use the search bar to find movies by name
3. **Filter**: Click genre or language buttons to filter movies
4. **Watch Trailers**: Click any movie card to watch its YouTube trailer
5. **Sign Up**: Create an account to access personalized features
6. **Login**: Sign in to your account

### For Developers

- **API Endpoints**:
  - `GET /api/movies` - Get all movies (supports `?genre=`, `?language=`, `?search=` query parameters)
  - `GET /api/genres` - Get all available genres
  - `GET /api/languages` - Get all available languages

- **Database Schema**:
  - `users` table: id, username, email, password (hashed)
  - `movies` table: id, title, genre, language, image_url, youtube_link

## 🎨 Design Features

- **3D Card Effects**: Movie cards have 3D transform effects on hover
- **Neon Glow**: Glowing borders and text effects throughout
- **Smooth Animations**: CSS transitions and animations for all interactions
- **Dark Theme**: Beautiful dark background with colorful accents
- **Responsive Grid**: Adaptive movie grid that works on all devices

## 🔒 Security

- Passwords are hashed using bcrypt
- SQL injection protection via parameterized queries
- Session management for user authentication

## 🌐 Deployment

### Local Development
The app runs on `http://localhost:5000` by default.

### Production Deployment

For production deployment (Render, Heroku, etc.):

1. Update `app.secret_key` in `app.py` with a secure random key
2. Set environment variables if needed
3. Update database path if using a different database
4. Ensure all dependencies are in `requirements.txt`

## 📝 Notes

- The database is automatically initialized on first run
- Movies are preloaded with real poster images and YouTube trailer links
- All movie data is stored in SQLite for easy setup
- The app uses vanilla JavaScript (no frameworks) for maximum compatibility

## 🎬 Movie Categories

- **Genres**: Action, Comedy, Drama, Horror, Romantic, Sci-Fi
- **Languages**: English, Hindi, Tamil, Telugu, Bangla

## 📧 Support

For issues or questions, please check the code comments or create an issue in the repository.

---

**Enjoy your movie browsing experience! 🍿**

