require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt'); 
const session = require('express-session');
const db = require('./config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.static('public'));
const isAuthenticated = (req, res, next) => {
    if (req.session.admin) {
        return next();
    }
    res.redirect('/login');
};


app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.set('view engine', 'ejs');

// 🔌 Database connection test
db.query('SELECT 1')
  .then(() => console.log('Database connection successful!'))
  .catch((err) => console.error('Database connection failed:', err.message));

// 🔐 Routes
app.get('/login', (req, res) => {
    res.render('login'); 
});

// Redirect root to login
app.get('/', (req, res) => res.redirect('/login'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
        
        if (rows.length === 0) {
            return res.render('login', { error: 'Wrong username or password' });
        }

        const admin = rows[0];
        const isMatch = await bcrypt.compare(password, admin.password);

        if (isMatch) {
            req.session.admin = admin;
            res.redirect('/dashboard'); 
        } else {
            res.render('login', { error: 'Incorrect username or password' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

//Dashboard route
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const [[{ jobCount }]] = await db.query('SELECT COUNT(*) as jobCount FROM careers');
        const [[{ appCount }]] = await db.query('SELECT COUNT(*) as appCount FROM applications');
        res.render('dashboard', { jobCount, appCount });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


//careers route
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/careers';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Update GET /careers to also fetch applications per job
app.get('/careers', isAuthenticated, async (req, res) => {
    try {
        const [jobs] = await db.query('SELECT * FROM careers ORDER BY posted_at DESC');
        const [applications] = await db.query(`
            SELECT a.*, c.job_title 
            FROM applications a 
            JOIN careers c ON a.career_id = c.id 
            ORDER BY a.submitted_at DESC
        `);
        // Count applications per job
        const [counts] = await db.query(`
            SELECT career_id, COUNT(*) as count 
            FROM applications 
            GROUP BY career_id
        `);
        const appCounts = {};
        counts.forEach(row => appCounts[row.career_id] = row.count);

        res.render('careers', { jobs, applications, appCounts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// GET /careers/applications/:id — view applications for one job
app.get('/careers/applications/:id', isAuthenticated, async (req, res) => {
    try {
        const [[job]] = await db.query('SELECT * FROM careers WHERE id = ?', [req.params.id]);
        const [applications] = await db.query(
            'SELECT * FROM applications WHERE career_id = ? ORDER BY submitted_at DESC',
            [req.params.id]
        );
        res.render('job-applications', { job, applications });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/careers/create', isAuthenticated, upload.single('image'), async (req, res) => {
    const { job_title, department, location, description } = req.body;
    const image_path = req.file ? '/uploads/careers/' + req.file.filename : null;
    try {
        await db.query(
            'INSERT INTO careers (job_title, department, location, description, image_path, posted_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [job_title, department, location, description, image_path]
        );
        res.redirect('/careers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating job');
    }
});

app.post('/careers/update/:id', isAuthenticated, upload.single('image'), async (req, res) => {
    const { job_title, department, location, description } = req.body;
    const { id } = req.params;
    try {
        if (req.file) {
            // Delete old image if exists
            const [[old]] = await db.query('SELECT image_path FROM careers WHERE id = ?', [id]);
            if (old?.image_path) {
                const oldPath = 'public' + old.image_path;
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            const image_path = '/uploads/careers/' + req.file.filename;
            await db.query(
                'UPDATE careers SET job_title=?, department=?, location=?, description=?, image_path=? WHERE id=?',
                [job_title, department, location, description, image_path, id]
            );
        } else {
            await db.query(
                'UPDATE careers SET job_title=?, department=?, location=?, description=? WHERE id=?',
                [job_title, department, location, description, id]
            );
        }
        res.redirect('/careers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating job');
    }
});

// POST /careers/delete/:id
app.post('/careers/delete/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const [[job]] = await db.query('SELECT image_path FROM careers WHERE id = ?', [id]);
        if (job?.image_path) {
            const oldPath = 'public' + job.image_path;
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        await db.query('DELETE FROM careers WHERE id = ?', [id]);
        res.redirect('/careers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting job');
    }
});

// 🚀 Start the web server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});