require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./config/db');
const cookieSession = require('cookie-session');
const app = express();
const { uploadImage, uploadMemberPhoto } = require('./config/cloudinary');


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

// ===== EVENTS =====

app.get('/events', isAuthenticated, async (req, res) => {
    try {
        const [events] = await db.query('SELECT * FROM events ORDER BY event_date DESC');
        const [counts] = await db.query('SELECT event_id, COUNT(*) as count FROM event_registrations GROUP BY event_id');
        const regCounts = {};
        counts.forEach(row => regCounts[row.event_id] = row.count);
        res.render('event', { events, regCounts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/events/create', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { title, category, event_date, location, description, register_link } = req.body;
    const is_featured = req.body.is_featured ? 1 : 0;
    const image_path = req.file ? req.file.path : null;
    try {
        await db.query(
            'INSERT INTO events (title, category, event_date, location, description, image_path, register_link, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [title, category, event_date, location, description, image_path, register_link, is_featured]
        );
        res.redirect('/events');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating event');
    }
});

app.post('/events/update/:id', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { title, category, event_date, location, description, register_link } = req.body;
    const is_featured = req.body.is_featured ? 1 : 0;
    const { id } = req.params;
    try {
        if (req.file) {
            await db.query(
                'UPDATE events SET title=?, category=?, event_date=?, location=?, description=?, register_link=?, is_featured=?, image_path=? WHERE id=?',
                [title, category, event_date, location, description, register_link, is_featured, req.file.path, id]
            );
        } else {
            await db.query(
                'UPDATE events SET title=?, category=?, event_date=?, location=?, description=?, register_link=?, is_featured=? WHERE id=?',
                [title, category, event_date, location, description, register_link, is_featured, id]
            );
        }
        res.redirect('/events');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating event');
    }
});

app.post('/events/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
        res.redirect('/events');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting event');
    }
});

app.get('/events/registrations/:id', isAuthenticated, async (req, res) => {
    try {
        const [[event]] = await db.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
        const [registrations] = await db.query(
            'SELECT * FROM event_registrations WHERE event_id = ? ORDER BY registered_at DESC',
            [req.params.id]
        );
        res.render('event-registrations', { event, registrations });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

/* =====================================================
   MEMBERS PAGE (overview with tabs)
===================================================== */
app.get('/members', isAuthenticated, async (req, res) => {
    try {
        const [members] = await db.query('SELECT * FROM members ORDER BY full_name ASC');
        const [honorary] = await db.query('SELECT * FROM honorary_members ORDER BY display_order ASC');
        const [groups] = await db.query('SELECT * FROM executive_groups ORDER BY display_order ASC');
        const [executives] = await db.query('SELECT * FROM executive_members ORDER BY display_order ASC');

        // Attach executives to their groups
        const groupedExecutives = groups.map(group => ({
            ...group,
            members: executives.filter(e => e.group_id === group.id)
        }));

        const president = executives.find(e => e.is_president);

        res.render('members', { members, honorary, groupedExecutives, president, groups });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* =====================================================
   REGULAR MEMBERS — CRUD
===================================================== */
app.post('/members/create', isAuthenticated, async (req, res) => {
    const { full_name, company, valid_till } = req.body;
    try {
        await db.query(
            'INSERT INTO members (full_name, company, valid_till) VALUES (?, ?, ?)',
            [full_name, company, valid_till]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating member');
    }
});

app.post('/members/update/:id', isAuthenticated, async (req, res) => {
    const { full_name, company, valid_till } = req.body;
    try {
        await db.query(
            'UPDATE members SET full_name=?, company=?, valid_till=? WHERE id=?',
            [full_name, company, valid_till, req.params.id]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating member');
    }
});

app.post('/members/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM members WHERE id = ?', [req.params.id]);
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting member');
    }
});

/* =====================================================
   HONORARY MEMBERS — CRUD
===================================================== */
app.post('/members/honorary/create', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { full_name, title, description, display_order } = req.body;
    const image_path = req.file ? req.file.path : null;
    try {
        await db.query(
            'INSERT INTO honorary_members (full_name, title, description, image_path, display_order) VALUES (?, ?, ?, ?, ?)',
            [full_name, title, description, image_path, display_order || 0]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating honorary member');
    }
});

app.post('/members/honorary/update/:id', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { full_name, title, description, display_order } = req.body;
    try {
        if (req.file) {
            await db.query(
                'UPDATE honorary_members SET full_name=?, title=?, description=?, image_path=?, display_order=? WHERE id=?',
                [full_name, title, description, req.file.path, display_order || 0, req.params.id]
            );
        } else {
            await db.query(
                'UPDATE honorary_members SET full_name=?, title=?, description=?, display_order=? WHERE id=?',
                [full_name, title, description, display_order || 0, req.params.id]
            );
        }
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating honorary member');
    }
});

app.post('/members/honorary/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM honorary_members WHERE id = ?', [req.params.id]);
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting honorary member');
    }
});

/* =====================================================
   EXECUTIVE GROUPS — CRUD
===================================================== */
app.post('/members/groups/create', isAuthenticated, async (req, res) => {
    const { group_name, display_order } = req.body;
    try {
        await db.query(
            'INSERT INTO executive_groups (group_name, display_order) VALUES (?, ?)',
            [group_name, display_order || 0]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating group');
    }
});

app.post('/members/groups/update/:id', isAuthenticated, async (req, res) => {
    const { group_name, display_order } = req.body;
    try {
        await db.query(
            'UPDATE executive_groups SET group_name=?, display_order=? WHERE id=?',
            [group_name, display_order || 0, req.params.id]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating group');
    }
});

app.post('/members/groups/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM executive_groups WHERE id = ?', [req.params.id]);
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting group');
    }
});

/* =====================================================
   EXECUTIVE MEMBERS — CRUD
===================================================== */
app.post('/members/executive/create', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { group_id, full_name, title, description, is_president, president_vision, display_order } = req.body;
    const image_path = req.file ? req.file.path : null;
    try {
        // If this person is being set as president, unset any existing president first
        if (is_president === 'on') {
            await db.query('UPDATE executive_members SET is_president = FALSE');
        }
        await db.query(
            `INSERT INTO executive_members 
            (group_id, full_name, title, description, image_path, is_president, president_vision, display_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [group_id, full_name, title, description, image_path, is_president === 'on', president_vision || null, display_order || 0]
        );
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating executive member');
    }
});

app.post('/members/executive/update/:id', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { group_id, full_name, title, description, is_president, president_vision, display_order } = req.body;
    try {
        if (is_president === 'on') {
            await db.query('UPDATE executive_members SET is_president = FALSE');
        }
        if (req.file) {
            await db.query(
                `UPDATE executive_members 
                SET group_id=?, full_name=?, title=?, description=?, image_path=?, is_president=?, president_vision=?, display_order=? 
                WHERE id=?`,
                [group_id, full_name, title, description, req.file.path, is_president === 'on', president_vision || null, display_order || 0, req.params.id]
            );
        } else {
            await db.query(
                `UPDATE executive_members 
                SET group_id=?, full_name=?, title=?, description=?, is_president=?, president_vision=?, display_order=? 
                WHERE id=?`,
                [group_id, full_name, title, description, is_president === 'on', president_vision || null, display_order || 0, req.params.id]
            );
        }
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating executive member');
    }
});

app.post('/members/executive/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM executive_members WHERE id = ?', [req.params.id]);
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting executive member');
    }
});

module.exports = app;