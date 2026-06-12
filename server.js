const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'amazigh_tournament_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 3600000 }
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté'), false);
    }
  }
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.adminLoggedIn) {
    next();
  } else {
    res.status(401).json({ error: 'Non autorisé' });
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
  if (req.session.adminLoggedIn) {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  } else {
    res.redirect('/');
  }
});

// API: Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin15') {
    req.session.adminLoggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API: Teams
app.get('/api/teams', (req, res) => {
  db.all("SELECT id, name FROM teams ORDER BY name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/teams', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Nom requis' });
  }
  db.run("INSERT INTO teams (name) VALUES (?)", [name.trim()], function(err) {
    if (err) return res.status(400).json({ error: 'Équipe existe déjà' });
    res.json({ id: this.lastID, name: name.trim() });
  });
});

app.delete('/api/teams/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM teams WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: Matches
app.get('/api/matches', (req, res) => {
  db.all(`SELECT m.*, t1.name as home_name, t2.name as away_name 
          FROM matches m
          JOIN teams t1 ON m.team_home = t1.id
          JOIN teams t2 ON m.team_away = t2.id
          ORDER BY 
            CASE m.round 
              WHEN 'ⵣ Finale ⵣ' THEN 1
              WHEN 'ⴰⴷⴰⴷ Demi-finale' THEN 2
              WHEN 'ⵉⵣⵎⴰⵣ Quart de finale' THEN 3
              ELSE 4
            END, m.id`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/matches', requireAuth, (req, res) => {
  const { home_team_id, away_team_id, round } = req.body;
  if (home_team_id === away_team_id) {
    return res.status(400).json({ error: 'Même équipe' });
  }
  db.run("INSERT INTO matches (team_home, team_away, round) VALUES (?,?,?)",
    [home_team_id, away_team_id, round || 'Phase de groupes'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

app.put('/api/matches/:id', requireAuth, (req, res) => {
  const { home_score, away_score, played } = req.body;
  db.run("UPDATE matches SET home_score = ?, away_score = ?, played = ? WHERE id = ?",
    [home_score, away_score, played, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/matches/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM matches WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// API: Standings
app.get('/api/standings', (req, res) => {
  db.all("SELECT id, name FROM teams", (err, teams) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all("SELECT team_home, team_away, home_score, away_score FROM matches WHERE played = 1", (err, matches) => {
      const standings = {};
      teams.forEach(t => {
        standings[t.id] = {
          name: t.name,
          matches: 0, wins: 0, draws: 0, losses: 0,
          goals_for: 0, goals_against: 0, points: 0
        };
      });
      
      matches.forEach(m => {
        const home = standings[m.team_home];
        const away = standings[m.team_away];
        home.matches++; away.matches++;
        home.goals_for += m.home_score;
        home.goals_against += m.away_score;
        away.goals_for += m.away_score;
        away.goals_against += m.home_score;
        
        if (m.home_score > m.away_score) {
          home.wins++; away.losses++;
          home.points += 3;
        } else if (m.away_score > m.home_score) {
          away.wins++; home.losses++;
          away.points += 3;
        } else {
          home.draws++; away.draws++;
          home.points += 1; away.points += 1;
        }
      });
      
      const sorted = Object.values(standings).sort((a,b) => {
        if (a.points !== b.points) return b.points - a.points;
        return (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against);
      });
      
      res.json(sorted);
    });
  });
});

// API: Player of the day
app.get('/api/player-of-day', (req, res) => {
  db.get("SELECT * FROM player_of_day WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { player_name: 'À venir', description: '' });
  });
});

app.post('/api/player-of-day', requireAuth, (req, res) => {
  const { player_name, description } = req.body;
  db.run("UPDATE player_of_day SET player_name = ?, description = ?, last_updated = CURRENT_TIMESTAMP WHERE id = 1",
    [player_name, description], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/upload-player-image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const imagePath = `/uploads/${req.file.filename}`;
  db.run("UPDATE player_of_day SET image_path = ? WHERE id = 1", [imagePath], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, image_path: imagePath });
  });
});

app.listen(PORT, () => {
  console.log(`ⵣ Tournoi Amazigh lancé sur http://localhost:${PORT}`);
});