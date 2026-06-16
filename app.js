require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./config/db');
const { uploadImage } = require('./config/cloudinary');
const cookieSession = require('cookie-session');
const app = express();

// Middleware — order matters
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';

app.use(cookieSession({
    name: 'session',
    secret: process.env.SESSION_SECRET,
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProd,
    httpOnly: true,
    sameSite: 'lax'
}));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');

const isAuthenticated = (req, res, next) => {
    if (req.session.admin) return next();
    res.redirect('/login');
};

// DB test
db.query('SELECT 1')
  .then(() => console.log('Database connection successful!'))
  .catch((err) => console.error('Database connection failed:', err.message));

// Auth routes
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    res.render('login');
});

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

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

// Dashboard
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

// Careers
app.get('/careers', isAuthenticated, async (req, res) => {
    try {
        const [jobs] = await db.query('SELECT * FROM careers ORDER BY posted_at DESC');
        const [applications] = await db.query(`
            SELECT a.*, c.job_title 
            FROM applications a 
            JOIN careers c ON a.career_id = c.id 
            ORDER BY a.submitted_at DESC
        `);
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

app.post('/careers/create', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { job_title, department, location, description } = req.body;
    const image_path = req.file ? req.file.path : null;
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

app.post('/careers/update/:id', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { job_title, department, location, description } = req.body;
    const { id } = req.params;
    try {
        if (req.file) {
            const image_path = req.file.path;
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

app.post('/careers/delete/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM careers WHERE id = ?', [id]);
        res.redirect('/careers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting job');
    }
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;