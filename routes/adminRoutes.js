const db = require('../config/db'); 
const careerModel = require('../models/dataModel');

router.get('/careers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM careers');
        res.render('careers', { careers: rows });
    } catch (err) {
        res.status(500).send("Database error");
    }
});