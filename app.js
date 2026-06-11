require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt'); 
const session = require('express-session');
const db = require('./config/db');
const app = express();
const isAuthenticated = (req, res, next) => {
    if (req.session.admin) {
        return next();
    }
    res.redirect('/login');
};

app.use('/images', express.static('images'));
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

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// 🚀 Start the web server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});