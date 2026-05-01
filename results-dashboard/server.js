const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DASHBOARD_TOKEN || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'results.db');

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        }
    }
}));

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ─────────────────────────────────────────────────────────────────
let db = null;

fs.mkdirSync(DATA_DIR, { recursive: true });

async function initDb() {
    const SQL = await initSqlJs();

    // Load existing DB from file if it exists
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS results (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
            platform    TEXT NOT NULL,
            quizTitle   TEXT DEFAULT '',
            totalQuestions  INTEGER DEFAULT 0,
            correctAnswers  INTEGER DEFAULT 0,
            wrongAnswers    INTEGER DEFAULT 0,
            skipped         INTEGER DEFAULT 0,
            solveMode       TEXT DEFAULT 'ai',
            model           TEXT DEFAULT '',
            provider        TEXT DEFAULT 'openrouter',
            inputTokens     INTEGER DEFAULT 0,
            outputTokens    INTEGER DEFAULT 0,
            estimatedCost   REAL DEFAULT 0.0,
            reasoningEnabled INTEGER DEFAULT 0,
            reasoningEffort  TEXT DEFAULT 'medium'
        )
    `);

    saveDb();
    console.log('  Database initialized.');
}

function saveDb() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 30 seconds
setInterval(saveDb, 30000);

// ── Auth Middleware ───────────────────────────────────────────────────────────
function authRequired(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    if (auth.slice(7) !== TOKEN) {
        return res.status(403).json({ error: 'Invalid token.' });
    }
    next();
}

// Rate limiting
const rateLimits = new Map();
function rateLimit(windowMs, maxRequests) {
    return (req, res, next) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const now = Date.now();
        const entry = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };

        if (now > entry.resetAt) {
            entry.count = 0;
            entry.resetAt = now + windowMs;
        }

        entry.count++;
        rateLimits.set(ip, entry);

        if (entry.count > maxRequests) {
            return res.status(429).json({ error: 'Too many requests.' });
        }
        next();
    };
}

// ── Helper: run query and return rows ────────────────────────────────────────
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows[0] || null;
}

// ── API Routes ───────────────────────────────────────────────────────────────

// POST /api/results
app.post('/api/results', authRequired, rateLimit(60000, 30), (req, res) => {
    try {
        const b = req.body;
        db.run(`
            INSERT INTO results (
                timestamp, platform, quizTitle, totalQuestions, correctAnswers,
                wrongAnswers, skipped, solveMode, model, provider,
                inputTokens, outputTokens, estimatedCost, reasoningEnabled, reasoningEffort
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            b.timestamp || new Date().toISOString(),
            b.platform || 'unknown',
            b.quizTitle || '',
            b.totalQuestions || 0,
            b.correctAnswers || 0,
            b.wrongAnswers || 0,
            b.skipped || 0,
            b.solveMode || 'ai',
            b.model || '',
            b.provider || 'openrouter',
            b.inputTokens || 0,
            b.outputTokens || 0,
            b.estimatedCost || 0,
            b.reasoningEnabled ? 1 : 0,
            b.reasoningEffort || 'medium'
        ]);

        saveDb();

        // Get the last inserted ID
        const lastId = queryOne('SELECT last_insert_rowid() AS id');
        res.json({ ok: true, id: lastId?.id || 0 });
    } catch (err) {
        console.error('POST /api/results error:', err.message);
        res.status(500).json({ error: 'Database error.' });
    }
});

// GET /api/results
app.get('/api/results', authRequired, (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
        const platform = req.query.platform;

        let query = 'SELECT * FROM results';
        const params = [];

        if (platform && platform !== 'all') {
            query += ' WHERE platform = ?';
            params.push(platform);
        }

        query += ' ORDER BY id DESC LIMIT ?';
        params.push(limit);

        const rows = queryAll(query, params);
        res.json({ results: rows });
    } catch (err) {
        console.error('GET /api/results error:', err.message);
        res.status(500).json({ error: 'Database error.' });
    }
});

// GET /api/results/stats
app.get('/api/results/stats', authRequired, (req, res) => {
    try {
        const stats = queryOne(`
            SELECT
                COUNT(*)                        AS totalGames,
                COALESCE(SUM(totalQuestions), 0) AS totalQuestions,
                COALESCE(SUM(correctAnswers), 0) AS totalCorrect,
                COALESCE(SUM(wrongAnswers), 0)   AS totalWrong,
                COALESCE(SUM(skipped), 0)        AS totalSkipped,
                COALESCE(SUM(inputTokens), 0)    AS totalInputTokens,
                COALESCE(SUM(outputTokens), 0)   AS totalOutputTokens,
                COALESCE(SUM(estimatedCost), 0)  AS totalCost,
                COALESCE(MAX(timestamp), '')      AS lastGame
            FROM results
        `) || {};

        const modelRow = queryOne(`
            SELECT model, COUNT(*) AS cnt FROM results
            GROUP BY model ORDER BY cnt DESC LIMIT 1
        `);

        const platformRow = queryOne(`
            SELECT platform, COUNT(*) AS cnt FROM results
            GROUP BY platform ORDER BY cnt DESC LIMIT 1
        `);

        const platformStats = queryAll(`
            SELECT platform,
                COUNT(*) AS games,
                SUM(correctAnswers) AS correct,
                SUM(wrongAnswers) AS wrong,
                SUM(totalQuestions) AS questions
            FROM results GROUP BY platform
        `);

        res.json({
            ...stats,
            accuracy: stats.totalQuestions > 0
                ? ((stats.totalCorrect / stats.totalQuestions) * 100).toFixed(1)
                : '0.0',
            topModel: modelRow?.model || 'N/A',
            topPlatform: platformRow?.platform || 'N/A',
            platformBreakdown: platformStats
        });
    } catch (err) {
        console.error('GET /api/results/stats error:', err.message);
        res.status(500).json({ error: 'Database error.' });
    }
});

// DELETE /api/results/:id
app.delete('/api/results/:id', authRequired, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });

        db.run('DELETE FROM results WHERE id = ?', [id]);
        saveDb();
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE error:', err.message);
        res.status(500).json({ error: 'Database error.' });
    }
});

// DELETE /api/results
app.delete('/api/results', authRequired, (req, res) => {
    try {
        db.run('DELETE FROM results');
        saveDb();
        res.json({ ok: true });
    } catch (err) {
        console.error('DELETE ALL error:', err.message);
        res.status(500).json({ error: 'Database error.' });
    }
});

// Health check (no auth)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Start ────────────────────────────────────────────────────────────────────
initDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n  ╔══════════════════════════════════════════════╗`);
        console.log(`  ║  KahootHackerAI Results Dashboard             ║`);
        console.log(`  ║  Running on http://0.0.0.0:${PORT}              ║`);
        console.log(`  ╚══════════════════════════════════════════════╝\n`);

        if (TOKEN === process.env.DASHBOARD_TOKEN) {
            console.log(`  Token: (set via DASHBOARD_TOKEN env)\n`);
        } else {
            console.log(`  ⚠ No DASHBOARD_TOKEN env set. Generated random token:`);
            console.log(`  ${TOKEN}\n`);
            console.log(`  Set DASHBOARD_TOKEN in docker-compose.yml to persist it.\n`);
        }
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
