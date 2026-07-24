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

async function ensureSponsorsTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS sponsors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                description TEXT,
                website VARCHAR(255),
                logo_path VARCHAR(255),
                status VARCHAR(20) DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Sponsors table ready');
    } catch (err) {
        console.error('Error ensuring sponsors table:', err.message);
    }
}

async function ensureContactSettingsTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS contact_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                twitter_url VARCHAR(255) DEFAULT '',
                instagram_url VARCHAR(255) DEFAULT '',
                linkedin_url VARCHAR(255) DEFAULT '',
                email_address VARCHAR(255) DEFAULT '',
                phone_number VARCHAR(255) DEFAULT '',
                address TEXT,
                website_url VARCHAR(255) DEFAULT '',
                map_url VARCHAR(255) DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        const [columns] = await db.query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_settings'"
        );
        const existingColumns = new Set(columns.map(column => column.COLUMN_NAME));

        const columnsToAdd = [
            ['email_address', "VARCHAR(255) DEFAULT ''"],
            ['phone_number', "VARCHAR(255) DEFAULT ''"],
            ['address', 'TEXT'],
            ['website_url', "VARCHAR(255) DEFAULT ''"],
            ['map_url', "VARCHAR(255) DEFAULT ''"]
        ];

        for (const [columnName, columnDefinition] of columnsToAdd) {
            if (!existingColumns.has(columnName)) {
                await db.query(`ALTER TABLE contact_settings ADD COLUMN ${columnName} ${columnDefinition}`);
            }
        }

        const [rows] = await db.query('SELECT COUNT(*) as count FROM contact_settings');
        if (rows[0].count === 0) {
            await db.query(
                'INSERT INTO contact_settings (twitter_url, instagram_url, linkedin_url, email_address, phone_number, address, website_url, map_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ['', '', '', '', '', '', '', '']
            );
        }
        console.log('Contact settings table ready');
    } catch (err) {
        console.error('Error ensuring contact settings table:', err.message);
    }
}

async function ensureCommunityTables() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS community_entries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                short_description TEXT,
                full_description TEXT,
                display_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entry_id INT NOT NULL,
                image_path VARCHAR(500) NOT NULL,
                display_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (entry_id),
                CONSTRAINT fk_community_images_entry
                    FOREIGN KEY (entry_id) REFERENCES community_entries(id)
                    ON DELETE CASCADE
            )
        `);
        console.log('Community tables ready');
    } catch (err) {
        console.error('Error ensuring community tables:', err.message);
    }
}

ensureSponsorsTable();
ensureContactSettingsTable();
ensureCommunityTables();

async function ensureEnquiriesTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS enquiries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                organization VARCHAR(255) DEFAULT '',
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(100) DEFAULT '',
                subject VARCHAR(255) DEFAULT '',
                message TEXT NOT NULL,
                source VARCHAR(100) DEFAULT 'support',
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Enquiries table ready');
    } catch (err) {
        console.error('Error ensuring enquiries table:', err.message);
    }
}

ensureEnquiriesTable();

async function getContactSettings() {
    const [rows] = await db.query('SELECT * FROM contact_settings ORDER BY id DESC LIMIT 1');
    return rows[0] || {
        twitter_url: '',
        instagram_url: '',
        linkedin_url: '',
        email_address: '',
        phone_number: '',
        address: '',
        website_url: '',
        map_url: ''
    };
}

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
            req.session.admin = { id: admin.id, username: admin.username };
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

// Public contact page
app.get('/contact', async (req, res) => {
    try {
        const settings = await getContactSettings();
        res.render('public-contact', { settings });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Contacts
app.get('/contacts', isAuthenticated, async (req, res) => {
    try {
        const settings = await getContactSettings();
        res.render('contact', {
            settings,
            error: req.query.error || null,
            notice: req.query.notice || null,
            tab: req.query.tab || 'socials'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/contacts/update', isAuthenticated, async (req, res) => {
    const {
        twitter_url,
        instagram_url,
        linkedin_url,
        email_address,
        phone_number,
        address,
        website_url,
        map_url,
        active_tab
    } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM contact_settings ORDER BY id DESC LIMIT 1');

        if (rows.length === 0) {
            await db.query(
                'INSERT INTO contact_settings (twitter_url, instagram_url, linkedin_url, email_address, phone_number, address, website_url, map_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [twitter_url || '', instagram_url || '', linkedin_url || '', email_address || '', phone_number || '', address || '', website_url || '', map_url || '']
            );
        } else {
            await db.query(
                'UPDATE contact_settings SET twitter_url = ?, instagram_url = ?, linkedin_url = ?, email_address = ?, phone_number = ?, address = ?, website_url = ?, map_url = ? WHERE id = ?',
                [twitter_url || '', instagram_url || '', linkedin_url || '', email_address || '', phone_number || '', address || '', website_url || '', map_url || '', rows[0].id]
            );
        }

        const tab = active_tab && ['socials', 'email', 'contact'].includes(active_tab) ? active_tab : 'socials';
        const query = new URLSearchParams({ notice: 'Contact details updated successfully.', tab });
        res.redirect('/contacts?' + query.toString());
    } catch (err) {
        console.error(err);
        const tab = active_tab && ['socials', 'email', 'contact'].includes(active_tab) ? active_tab : 'socials';
        const query = new URLSearchParams({ error: 'Could not update contact details.', tab });
        res.redirect('/contacts?' + query.toString());
    }
});

// Enquiries (admin view)
app.get('/enquiries', isAuthenticated, async (req, res) => {
    try {
        // Use the Unix timestamp so MySQL driver's local-time conversion cannot shift
        // an enquiry's received time before it is displayed in Singapore time.
        const [rows] = await db.query(
            'SELECT *, UNIX_TIMESTAMP(created_at) AS created_at_epoch FROM enquiries ORDER BY created_at DESC'
        );
        res.render('enquiry', { enquiries: rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Debug route - only when DEBUG_ENQUIRIES=1
if (process.env.DEBUG_ENQUIRIES === '1') {
    app.get('/_debug_enquiries_count', isAuthenticated, async (req, res) => {
        try {
            const [[{cnt}]] = await db.query('SELECT COUNT(*) as cnt FROM enquiries');
            res.json({ count: cnt });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

app.post('/enquiries/mark-read/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('UPDATE enquiries SET is_read = 1 WHERE id = ?', [req.params.id]);
        res.redirect('/enquiries');
    } catch (err) {
        console.error(err);
        res.redirect('/enquiries');
    }
});

app.post('/enquiries/mark-unread/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('UPDATE enquiries SET is_read = 0 WHERE id = ?', [req.params.id]);
        res.redirect('/enquiries');
    } catch (err) {
        console.error(err);
        res.redirect('/enquiries');
    }
});

app.post('/enquiries/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM enquiries WHERE id = ?', [req.params.id]);
        res.redirect('/enquiries');
    } catch (err) {
        console.error(err);
        res.redirect('/enquiries');
    }
});

// Dashboard
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const [[{ memberCount }]]  = await db.query('SELECT COUNT(*) as memberCount FROM members');
        const [[{ pendingApps }]]  = await db.query("SELECT COUNT(*) as pendingApps FROM membership_applications WHERE status = 'pending'");
        const [[{ eventCount }]]   = await db.query('SELECT COUNT(*) as eventCount FROM events WHERE event_date >= CURDATE()');
        const [[{ jobCount }]]     = await db.query('SELECT COUNT(*) as jobCount FROM careers');
        const [[{ appCount }]]     = await db.query('SELECT COUNT(*) as appCount FROM applications');
        const [[{ openAwards }]]   = await db.query('SELECT COUNT(*) as openAwards FROM awards WHERE deadline >= CURDATE()');

        const [recentApps] = await db.query(
            "SELECT full_name, personal_email, hotel_name, submitted_at FROM membership_applications WHERE status = 'pending' ORDER BY submitted_at DESC LIMIT 5"
        );
        const [recentJobApps] = await db.query(
            `SELECT a.id, a.full_name, a.email, a.submitted_at,
                    a.career_id AS career_id, c.job_title
             FROM applications a
             JOIN careers c ON a.career_id = c.id
             ORDER BY a.submitted_at DESC LIMIT 5`
        );

        res.render('dashboard', { memberCount, pendingApps, eventCount, jobCount, appCount, openAwards, recentApps, recentJobApps });
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

app.post('/careers/applications/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const [[app]] = await db.query('SELECT career_id FROM applications WHERE id = ?', [req.params.id]);
        await db.query('DELETE FROM applications WHERE id = ?', [req.params.id]);
        const dest = app ? `/careers/applications/${app.career_id}` : '/careers';
        res.redirect(dest);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting application');
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

        const [applications] = await db.query(
            `SELECT * FROM membership_applications
             WHERE NOT (membership_type = 'Renew' AND status = 'accepted')
             ORDER BY (status = 'pending') DESC, submitted_at DESC`
        );

        res.render('members', {
            members, honorary, groupedExecutives, president, groups,
            applications,
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

/* =====================================================
   MEMBERSHIP APPLICATIONS (review + approve)
===================================================== */

// Generate a random, zero-padded 5-digit ID that isn't taken in either table
async function generateMemberId() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
        const [[inApps]] = await db.query(
            'SELECT COUNT(*) as n FROM membership_applications WHERE member_id = ?',
            [candidate]
        );
        const [[inMembers]] = await db.query(
            'SELECT COUNT(*) as n FROM members WHERE member_id = ?',
            [candidate]
        );
        if (inApps.n === 0 && inMembers.n === 0) return candidate;
    }
    throw new Error('Could not generate a unique member ID after 50 attempts');
}

// Backfill any existing members that have no member_id yet
async function backfillMemberIds() {
    try {
        const [nullMembers] = await db.query(
            'SELECT id FROM members WHERE member_id IS NULL ORDER BY id ASC'
        );
        for (const row of nullMembers) {
            const newId = await generateMemberId();
            await db.query('UPDATE members SET member_id = ? WHERE id = ?', [newId, row.id]);
        }
        if (nullMembers.length > 0) {
            console.log(`Backfilled member_id for ${nullMembers.length} existing member(s).`);
        }
    } catch (err) {
        console.error('Error during member_id backfill:', err);
    }
}

// Run backfill on startup
backfillMemberIds();

// List all applications
app.get('/membership', isAuthenticated, async (req, res) => {
    try {
        const [applications] = await db.query(
            `SELECT * FROM membership_applications
             WHERE NOT (membership_type = 'Renew' AND status = 'accepted')
             ORDER BY (status = 'pending') DESC, submitted_at DESC`
        );
        res.render('membership', {
            applications,
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Accept an application
app.post('/membership/accept/:id', isAuthenticated, async (req, res) => {
    try {
        const [[application]] = await db.query(
            'SELECT * FROM membership_applications WHERE id = ?',
            [req.params.id]
        );
        if (!application || application.status !== 'pending') {
            return res.redirect('/members?tab=applications&error=' + encodeURIComponent('Application not found or already processed.'));
        }

        // valid_till = 1 year from today
        const validTill = new Date();
        validTill.setFullYear(validTill.getFullYear() + 1);
        const validTillStr = validTill.toISOString().split('T')[0];

        if (application.membership_type === 'Renew') {
            const existing = (application.existing_member_id || '').trim();

            // Check the member exists in the members table
            const [[existingMember]] = await db.query(
                'SELECT * FROM members WHERE member_id = ?',
                [existing]
            );
            if (!existingMember) {
                return res.redirect('/members?tab=applications&error=' + encodeURIComponent(
                    `Cannot accept renewal: member ID "${existing}" not found.`
                ));
            }

            // Update the members table with latest details + refresh valid_till
            await db.query(
                `UPDATE members SET
                    title = ?, full_name = ?, company = ?, valid_till = ?, membership_tier = ?
                 WHERE member_id = ?`,
                [application.title || null, application.full_name, application.hotel_name || null, validTillStr, application.membership_tier || null, existing]
            );

            // Overwrite the original application record with renewed details (audit)
            await db.query(
                `UPDATE membership_applications SET
                    title = ?, full_name = ?, nationality = ?, date_of_birth = ?,
                    residential_address = ?, personal_email = ?, mobile_number = ?,
                    hotel_name = ?, business_address = ?, business_email = ?,
                    telephone_number = ?, current_position = ?, years_in_position = ?,
                    opt_email_updates = ?, opt_event_sms = ?, opt_admin_responsibility = ?,
                    consent = ?
                 WHERE member_id = ? AND status = 'accepted'`,
                [
                    application.title, application.full_name, application.nationality, application.date_of_birth,
                    application.residential_address, application.personal_email, application.mobile_number,
                    application.hotel_name, application.business_address, application.business_email,
                    application.telephone_number, application.current_position, application.years_in_position,
                    application.opt_email_updates, application.opt_event_sms, application.opt_admin_responsibility,
                    application.consent, existing
                ]
            );

            // Mark the renewal row itself as accepted
            await db.query(
                "UPDATE membership_applications SET status = 'accepted', reviewed_at = NOW() WHERE id = ?",
                [application.id]
            );

            return res.redirect('/members?tab=applications&notice=' + encodeURIComponent(
                `Renewal accepted for ${application.full_name} (ID: ${existing}). Valid till ${validTillStr}.`
            ));
        }

        // New application → mint a fresh unique ID
        const newId = await generateMemberId();

        // Save to membership_applications
        await db.query(
            "UPDATE membership_applications SET status = 'accepted', member_id = ?, reviewed_at = NOW() WHERE id = ?",
            [newId, application.id]
        );

        // Auto-create the members row
        await db.query(
            'INSERT INTO members (title, full_name, company, valid_till, member_id, membership_tier) VALUES (?, ?, ?, ?, ?, ?)',
            [application.title || null, application.full_name, application.hotel_name || null, validTillStr, newId, application.membership_tier || null]
        );

        res.redirect('/members?tab=applications&notice=' + encodeURIComponent(
            `Accepted. ${application.full_name} added to ARDE Members (ID: ${newId}, valid till ${validTillStr}).`
        ));
    } catch (err) {
        console.error(err);
        res.redirect('/members?tab=applications&error=' + encodeURIComponent('Something went wrong while accepting.'));
    }
});

// Decline an application
app.post('/membership/decline/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query(
            "UPDATE membership_applications SET status = 'declined', reviewed_at = NOW() WHERE id = ? AND status = 'pending'",
            [req.params.id]
        );
        res.redirect('/members?tab=applications&notice=' + encodeURIComponent('Application declined.'));
    } catch (err) {
        console.error(err);
        res.redirect('/members?tab=applications&error=' + encodeURIComponent('Something went wrong while declining.'));
    }
});

// Delete an application (only allowed once processed — not pending)
app.post('/membership/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query(
            "DELETE FROM membership_applications WHERE id = ? AND status != 'pending'",
            [req.params.id]
        );
        res.redirect('/members?tab=applications&notice=' + encodeURIComponent('Application deleted.'));
    } catch (err) {
        console.error(err);
        res.redirect('/members?tab=applications&error=' + encodeURIComponent('Could not delete application.'));
    }
});

/* =====================================================
   REGULAR MEMBERS — CRUD
===================================================== */
app.post('/members/create', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { title, full_name, company, valid_till, membership_tier } = req.body;
    const image_path = req.file ? req.file.path : null;
    try {
        const memberId = await generateMemberId();
        await db.query(
            'INSERT INTO members (full_name, company, valid_till, member_id, image_path, title, membership_tier) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [full_name, company || null, valid_till || null, memberId, image_path, title || null, membership_tier || null]
        );
        res.redirect('/members?notice=' + encodeURIComponent(`Member added. ID: ${memberId}`));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating member');
    }
});

app.post('/members/update/:id', isAuthenticated, uploadMemberPhoto.single('image'), async (req, res) => {
    const { title, full_name, company, valid_till, membership_tier } = req.body;
    try {
        if (req.file) {
            await db.query(
                'UPDATE members SET title=?, full_name=?, company=?, valid_till=?, image_path=?, membership_tier=? WHERE id=?',
                [title || null, full_name, company, valid_till, req.file.path, membership_tier || null, req.params.id]
            );
        } else {
            await db.query(
                'UPDATE members SET title=?, full_name=?, company=?, valid_till=?, membership_tier=? WHERE id=?',
                [title || null, full_name, company, valid_till, membership_tier || null, req.params.id]
            );
        }
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

// =====================================================
// AWARDS — ADMIN ROUTES
// =====================================================

// List all awards
app.get('/awards', isAuthenticated, async (req, res) => {
    try {
        const [awards] = await db.query('SELECT * FROM awards ORDER BY deadline DESC');

        // Registration counts per award
        const [counts] = await db.query(
            'SELECT award_id, COUNT(*) as count FROM award_registrations GROUP BY award_id'
        );
        const regCounts = {};
        counts.forEach(r => regCounts[r.award_id] = r.count);

        // Winner counts per award
        const [winnerRows] = await db.query(
            'SELECT award_id, COUNT(*) as count FROM award_winners GROUP BY award_id'
        );
        const winnerCounts = {};
        winnerRows.forEach(r => winnerCounts[r.award_id] = r.count);

        res.render('awards', {
            awards,
            regCounts,
            winnerCounts,
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create award
app.post('/awards/create', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { title, description, deadline, max_winners } = req.body;
    const image_path = req.file ? req.file.path : null;
    try {
        await db.query(
            'INSERT INTO awards (title, description, image_path, deadline, max_winners) VALUES (?, ?, ?, ?, ?)',
            [title, description, image_path, deadline, max_winners || 1]
        );
        res.redirect('/awards');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating award');
    }
});

// Update award
app.post('/awards/update/:id', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { title, description, deadline, max_winners } = req.body;
    const { id } = req.params;
    try {
        if (req.file) {
            await db.query(
                'UPDATE awards SET title=?, description=?, deadline=?, max_winners=?, image_path=? WHERE id=?',
                [title, description, deadline, max_winners || 1, req.file.path, id]
            );
        } else {
            await db.query(
                'UPDATE awards SET title=?, description=?, deadline=?, max_winners=? WHERE id=?',
                [title, description, deadline, max_winners || 1, id]
            );
        }
        res.redirect('/awards');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating award');
    }
});

// Delete award
app.post('/awards/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM awards WHERE id = ?', [req.params.id]);
        res.redirect('/awards');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting award');
    }
});

// View registrations for an award
app.get('/awards/registrations/:id', isAuthenticated, async (req, res) => {
    try {
        const [[award]] = await db.query('SELECT * FROM awards WHERE id = ?', [req.params.id]);
        if (!award) return res.status(404).send('Award not found');

        const [registrations] = await db.query(
            'SELECT * FROM award_registrations WHERE award_id = ? ORDER BY id ASC',
            [req.params.id]
        );
        const [winners] = await db.query(
            "SELECT * FROM award_winners WHERE award_id = ? AND role = 'winner' ORDER BY id ASC",
            [req.params.id]
        );
        const [runnerUps] = await db.query(
            "SELECT * FROM award_winners WHERE award_id = ? AND role = 'runner_up' ORDER BY id ASC",
            [req.params.id]
        );

        // IDs already chosen (to disable buttons in registrations tab)
        const chosenIds = [...winners, ...runnerUps].map(w => w.member_id);

        res.render('award-registration', {
            award,
            registrations,
            winners,
            runnerUps,
            chosenIds,
            tab: req.query.tab || 'registrations',
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error('[/awards/registrations] DB error:', err.message);
        res.status(500).send(`Server Error: ${err.message}`);
    }
});

// Choose a winner or runner-up from registrations
app.post('/awards/winners/choose/:award_id', isAuthenticated, async (req, res) => {
    const { award_id } = req.params;
    const { member_id, role } = req.body;
    const roleVal = role === 'runner_up' ? 'runner_up' : 'winner';
    try {
        const [[award]] = await db.query('SELECT * FROM awards WHERE id = ?', [award_id]);

        // Check winner cap (runner-ups are uncapped)
        if (roleVal === 'winner') {
            const [[{ count }]] = await db.query(
                "SELECT COUNT(*) as count FROM award_winners WHERE award_id = ? AND role = 'winner'",
                [award_id]
            );
            if (count >= award.max_winners) {
                return res.redirect(`/awards/registrations/${award_id}?error=` +
                    encodeURIComponent(`Maximum of ${award.max_winners} winner(s) already chosen.`));
            }
        }

        // Check not already chosen
        const [[already]] = await db.query(
            'SELECT id FROM award_winners WHERE award_id = ? AND member_id = ?',
            [award_id, member_id]
        );
        if (already) {
            return res.redirect(`/awards/registrations/${award_id}?error=` +
                encodeURIComponent('This member has already been chosen for this award.'));
        }

        // Get their name from registration
        const [[reg]] = await db.query(
            'SELECT * FROM award_registrations WHERE award_id = ? AND member_id = ?',
            [award_id, member_id]
        );
        if (!reg) {
            return res.redirect(`/awards/registrations/${award_id}?error=` +
                encodeURIComponent('Registration not found.'));
        }

        // Try to auto-fetch hotel from members table
        let hotel = null;
        const [[member]] = await db.query(
            'SELECT hotel_name FROM members WHERE member_id = ?', [member_id]
        ).catch(() => [[null]]);
        if (member && member.hotel_name) hotel = member.hotel_name;

        await db.query(
            'INSERT INTO award_winners (award_id, member_id, full_name, hotel, role) VALUES (?, ?, ?, ?, ?)',
            [award_id, member_id, reg.full_name, hotel, roleVal]
        );

        const label = roleVal === 'runner_up' ? 'runner-up' : 'winner';
        res.redirect(`/awards/registrations/${award_id}?tab=winners&notice=` +
            encodeURIComponent(`${reg.full_name} added as ${label}.`));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error choosing winner');
    }
});

// Edit a winner / runner-up (change role, name, or hotel)
app.post('/awards/winners/edit/:winner_id', isAuthenticated, async (req, res) => {
    const { winner_id } = req.params;
    const { award_id, full_name, hotel, role } = req.body;
    const roleVal = role === 'runner_up' ? 'runner_up' : 'winner';
    try {
        // If promoting to winner, check cap (exclude this record from count)
        if (roleVal === 'winner') {
            const [[award]] = await db.query('SELECT * FROM awards WHERE id = ?', [award_id]);
            const [[{ count }]] = await db.query(
                "SELECT COUNT(*) as count FROM award_winners WHERE award_id = ? AND role = 'winner' AND id != ?",
                [award_id, winner_id]
            );
            if (count >= award.max_winners) {
                return res.redirect(`/awards/registrations/${award_id}?tab=winners&error=` +
                    encodeURIComponent(`Cannot promote to winner: ${award.max_winners} winner(s) already set.`));
            }
        }
        await db.query(
            'UPDATE award_winners SET full_name = ?, hotel = ?, role = ? WHERE id = ?',
            [full_name, hotel || null, roleVal, winner_id]
        );
        res.redirect(`/awards/registrations/${award_id}?tab=winners&notice=` +
            encodeURIComponent('Updated successfully.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error editing winner');
    }
});

// Remove a winner / runner-up
app.post('/awards/winners/remove/:winner_id', isAuthenticated, async (req, res) => {
    const { award_id } = req.body;
    try {
        await db.query('DELETE FROM award_winners WHERE id = ?', [req.params.winner_id]);
        res.redirect(`/awards/registrations/${award_id}?tab=winners&notice=` +
            encodeURIComponent('Removed successfully.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error removing winner');
    }
});

// =====================================================
// SPONSORS & PARTNERSHIPS — ADMIN ROUTES
// =====================================================

// =====================================================
// COMMUNITY - ADMIN ROUTES
// =====================================================

async function getCommunityEntries() {
    const [entries] = await db.query('SELECT * FROM community_entries ORDER BY display_order ASC, created_at DESC');
    const [images] = await db.query('SELECT * FROM community_images ORDER BY display_order ASC, id ASC');
    const imagesByEntry = {};
    images.forEach(image => {
        if (!imagesByEntry[image.entry_id]) imagesByEntry[image.entry_id] = [];
        imagesByEntry[image.entry_id].push(image);
    });
    return entries.map(entry => ({ ...entry, images: imagesByEntry[entry.id] || [] }));
}

app.get('/community', isAuthenticated, async (req, res) => {
    try {
        const entries = await getCommunityEntries();
        res.render('community', {
            entries,
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/community/create', isAuthenticated, uploadImage.array('images', 10), async (req, res) => {
    const { title, short_description, full_description } = req.body;
    try {
        // Keep the latest admin addition at the front of the public story carousel.
        await db.query('UPDATE community_entries SET display_order = display_order + 1');
        const [result] = await db.query(
            'INSERT INTO community_entries (title, short_description, full_description, display_order) VALUES (?, ?, ?, ?)',
            [title, short_description || null, full_description || null, 1]
        );

        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                await db.query(
                    'INSERT INTO community_images (entry_id, image_path, display_order) VALUES (?, ?, ?)',
                    [result.insertId, req.files[i].path, i]
                );
            }
        }

        res.redirect('/community?notice=' + encodeURIComponent('Community entry created successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/community?error=' + encodeURIComponent('Could not create community entry.'));
    }
});

app.post('/community/update/:id', isAuthenticated, uploadImage.array('images', 10), async (req, res) => {
    const { title, short_description, full_description, display_order } = req.body;
    const { id } = req.params;
    try {
        await db.query(
            'UPDATE community_entries SET title=?, short_description=?, full_description=?, display_order=? WHERE id=?',
            [title, short_description || null, full_description || null, display_order || 0, id]
        );

        if (req.files && req.files.length > 0) {
            const [[{ max_order }]] = await db.query(
                'SELECT COALESCE(MAX(display_order), -1) as max_order FROM community_images WHERE entry_id = ?',
                [id]
            );
            for (let i = 0; i < req.files.length; i++) {
                await db.query(
                    'INSERT INTO community_images (entry_id, image_path, display_order) VALUES (?, ?, ?)',
                    [id, req.files[i].path, max_order + i + 1]
                );
            }
        }

        res.redirect('/community?notice=' + encodeURIComponent('Community entry updated successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/community?error=' + encodeURIComponent('Could not update community entry.'));
    }
});

app.post('/community/delete/:id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM community_entries WHERE id = ?', [req.params.id]);
        res.redirect('/community?notice=' + encodeURIComponent('Community entry deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/community?error=' + encodeURIComponent('Could not delete community entry.'));
    }
});

app.post('/community/images/update/:image_id', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { image_id } = req.params;
    const { display_order } = req.body;
    try {
        if (req.file) {
            await db.query(
                'UPDATE community_images SET image_path=?, display_order=? WHERE id=?',
                [req.file.path, display_order || 0, image_id]
            );
        } else {
            await db.query(
                'UPDATE community_images SET display_order=? WHERE id=?',
                [display_order || 0, image_id]
            );
        }
        res.redirect('/community?notice=' + encodeURIComponent('Community image updated successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/community?error=' + encodeURIComponent('Could not update community image.'));
    }
});

app.post('/community/images/delete/:image_id', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM community_images WHERE id = ?', [req.params.image_id]);
        res.redirect('/community?notice=' + encodeURIComponent('Community image deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.redirect('/community?error=' + encodeURIComponent('Could not delete community image.'));
    }
});

app.get('/sponsors', isAuthenticated, async (req, res) => {
    try {
        const [sponsors] = await db.query('SELECT * FROM sponsors ORDER BY created_at DESC');
        res.render('sponsors', {
            sponsors,
            error: req.query.error || null,
            notice: req.query.notice || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/sponsors/create', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { company_name, category, description, website, status } = req.body;
    const logo_path = req.file ? req.file.path : null;
    try {
        await db.query(
            'INSERT INTO sponsors (company_name, category, description, website, logo_path, status) VALUES (?, ?, ?, ?, ?, ?)',
            [company_name, category, description, website, logo_path, status || 'Active']
        );
        res.redirect('/sponsors?notice=' + encodeURIComponent('Sponsor created successfully.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating sponsor');
    }
});

app.get('/sponsors/view/:id', isAuthenticated, async (req, res) => {
    try {
        const [[sponsor]] = await db.query('SELECT * FROM sponsors WHERE id = ?', [req.params.id]);
        if (!sponsor) {
            return res.redirect('/sponsors?error=' + encodeURIComponent('Sponsor not found.'));
        }
        res.render('sponsor-view', {
            sponsor,
            editMode: req.query.edit === '1'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/sponsors/update/:id', isAuthenticated, uploadImage.single('image'), async (req, res) => {
    const { company_name, category, description, website, status } = req.body;
    const { id } = req.params;
    try {
        if (req.file) {
            await db.query(
                'UPDATE sponsors SET company_name=?, category=?, description=?, website=?, logo_path=?, status=? WHERE id=?',
                [company_name, category, description, website, req.file.path, status || 'Active', id]
            );
        } else {
            await db.query(
                'UPDATE sponsors SET company_name=?, category=?, description=?, website=?, status=? WHERE id=?',
                [company_name, category, description, website, status || 'Active', id]
            );
        }
        res.redirect(`/sponsors/view/${id}?notice=` + encodeURIComponent('Sponsor updated successfully.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating sponsor');
    }
});

app.post('/sponsors/delete/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM sponsors WHERE id = ?', [id]);
        res.redirect('/sponsors?notice=' + encodeURIComponent('Sponsor deleted successfully.'));
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting sponsor');
    }
});

module.exports = app;
