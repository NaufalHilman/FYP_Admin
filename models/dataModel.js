const db = require('../config/db'); // Path to your existing database connection

const Career = {
    // 1. Get all careers to display in the table
    getAll: async () => {
        const [rows] = await db.query('SELECT * FROM careers');
        return rows;
    },
    
    // 2. Add a new career entry
    create: async (data) => {
        const { title, description, location } = data;
        const [result] = await db.query(
            'INSERT INTO careers (title, description, location) VALUES (?, ?, ?)',
            [title, description, location]
        );
        return result;
    },

    // 3. Delete a career entry
    delete: async (id) => {
        await db.query('DELETE FROM careers WHERE id = ?', [id]);
    }
};

module.exports = Career;