const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const db = new Database('tournament.db');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_home INTEGER,
        team_away INTEGER,
        home_score INTEGER DEFAULT 0,
        away_score INTEGER DEFAULT 0,
        round TEXT DEFAULT 'Phase de groupes',
        played BOOLEAN DEFAULT 0,
        FOREIGN KEY(team_home) REFERENCES teams(id),
        FOREIGN KEY(team_away) REFERENCES teams(id)
    );
    
    CREATE TABLE IF NOT EXISTS player_of_day (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        player_name TEXT,
        image_path TEXT,
        description TEXT
    );
`);

// Add default data
const playerExists = db.prepare("SELECT * FROM player_of_day WHERE id = 1").get();
if (!playerExists) {
    db.prepare("INSERT INTO player_of_day (id, player_name, description) VALUES (1, 'ⵣ Joueur Étoile ⵣ', 'Star des montagnes d''Iferhounene')").run();
}

const teamCount = db.prepare("SELECT COUNT(*) as count FROM teams").get();
if (teamCount.count === 0) {
    const teams = ['ⴰⵜⵍⴰⵙ United', 'ⵉⴼⴻⵔⵀⵓⵏⴻⵏ FC', 'ⴰⵣⵔⵓ Warriors', 'ⴰⵢⵜ ⵊⴻⵔⵔⴰⵔ'];
    const insertTeam = db.prepare("INSERT INTO teams (name) VALUES (?)");
    teams.forEach(team => insertTeam.run(team));
}

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'amazigh_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// File upload
const storage = multer.diskStorage({
    destination: 'public/uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Auth middleware
const requireAuth = (req, res, next) => {
    if (req.session.admin) return next();
    res.status(401).json({ error: 'Non autorisé' });
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
    if (req.session.admin) {
        res.sendFile(path.join(__dirname, 'views', 'admin.html'));
    } else {
        res.redirect('/');
    }
});

// API Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin15') {
        req.session.admin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/teams', (req, res) => {
    const teams = db.prepare("SELECT * FROM teams ORDER BY name").all();
    res.json(teams);
});

app.post('/api/teams', requireAuth, (req, res) => {
    const { name } = req.body;
    try {
        const result = db.prepare("INSERT INTO teams (name) VALUES (?)").run(name);
        res.json({ id: result.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ error: 'Nom déjà pris' });
    }
});

app.delete('/api/teams/:id', requireAuth, (req, res) => {
    db.prepare("DELETE FROM teams WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

app.get('/api/matches', (req, res) => {
    const matches = db.prepare(`
        SELECT m.*, t1.name as home_name, t2.name as away_name 
        FROM matches m
        JOIN teams t1 ON m.team_home = t1.id
        JOIN teams t2 ON m.team_away = t2.id
        ORDER BY m.id
    `).all();
    res.json(matches);
});

app.post('/api/matches', requireAuth, (req, res) => {
    const { home_team_id, away_team_id, round } = req.body;
    const result = db.prepare(`
        INSERT INTO matches (team_home, team_away, round) 
        VALUES (?, ?, ?)
    `).run(home_team_id, away_team_id, round || 'Phase de groupes');
    res.json({ id: result.lastInsertRowid });
});

app.put('/api/matches/:id', requireAuth, (req, res) => {
    const { home_score, away_score, played } = req.body;
    db.prepare(`
        UPDATE matches 
        SET home_score = ?, away_score = ?, played = ? 
        WHERE id = ?
    `).run(home_score, away_score, played, req.params.id);
    res.json({ success: true });
});

app.delete('/api/matches/:id', requireAuth, (req, res) => {
    db.prepare("DELETE FROM matches WHERE id = ?").run(req.params.id);
    res.json({ success: true });
});

app.get('/api/standings', (req, res) => {
    const teams = db.prepare("SELECT id, name FROM teams").all();
    const matches = db.prepare("SELECT * FROM matches WHERE played = 1").all();
    
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
            home.points += 1;
            away.points += 1;
        }
    });
    
    const sorted = Object.values(standings).sort((a,b) => b.points - a.points);
    res.json(sorted);
});

app.get('/api/player-of-day', (req, res) => {
    const player = db.prepare("SELECT * FROM player_of_day WHERE id = 1").get();
    res.json(player || { player_name: 'À venir', description: '' });
});

app.post('/api/player-of-day', requireAuth, (req, res) => {
    const { player_name, description } = req.body;
    db.prepare(`
        UPDATE player_of_day 
        SET player_name = ?, description = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE id = 1
    `).run(player_name, description);
    res.json({ success: true });
});

app.post('/api/upload-player-image', requireAuth, upload.single('image'), (req, res) => {
    if (req.file) {
        const imagePath = `/uploads/${req.file.filename}`;
        db.prepare("UPDATE player_of_day SET image_path = ? WHERE id = 1").run(imagePath);
        res.json({ success: true, image_path: imagePath });
    } else {
        res.status(400).json({ error: 'No file' });
    }
});

app.listen(PORT, () => {
    console.log(`ⵣ Tournoi Amazigh lancé sur http://localhost:${PORT}`);
    console.log(`ⵣ Database: better-sqlite3`);
});