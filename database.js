const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'tournament.db'));

// Initialize database tables
db.serialize(() => {
  // Teams table
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Matches table
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_home INTEGER NOT NULL,
    team_away INTEGER NOT NULL,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    round TEXT DEFAULT 'Phase de groupes',
    played BOOLEAN DEFAULT 0,
    match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(team_home) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY(team_away) REFERENCES teams(id) ON DELETE CASCADE
  )`);
  
  // Player of the day table
  db.run(`CREATE TABLE IF NOT EXISTS player_of_day (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    player_name TEXT NOT NULL,
    image_path TEXT,
    description TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Insert default player if not exists
  db.get("SELECT * FROM player_of_day WHERE id = 1", (err, row) => {
    if (!row) {
      db.run("INSERT INTO player_of_day (id, player_name, description) VALUES (1, 'ⵣ Joueur Étoile ⵣ', 'Un talent pur des montagnesⵣ')");
    }
  });
  
  // Insert sample teams if emptydir
  db.get("SELECT COUNT(*) as count FROM teams", (err, row) => {
    if (row.count === 0) {
      const sampleTeams = ['ⴰⵜⵍⴰⵙ United', 'ⵉⴼⴻⵔⵀⵓⵏⴻⵏ FC', 'ⴰⵣⵔⵓ Warriors', 'ⴰⵢⵜ ⵊⴻⵔⵔⴰⵔ'];
      sampleTeams.forEach(team => {
        db.run("INSERT INTO teams (name) VALUES (?)", [team]);
      });
    }
  });
});

module.exports = db;