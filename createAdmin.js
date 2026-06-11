require('dotenv').config();
const db = require('./config/db');
const bcrypt = require('bcrypt');

async function createSuperAdmin() {
    const username = 'admin';
    const rawPassword = 'admin123'; 
    const saltRounds = 10;

    try {
        // Hash the password so it's safely encrypted 
        const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

        // Insert the credentials into the admins table
        const query = 'INSERT INTO admins (username, password) VALUES (?, ?)';
        await db.query(query, [username, hashedPassword]);

        console.log('✅ Admin created successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        process.exit(1);
    }
}

createSuperAdmin();