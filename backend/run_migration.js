const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

async function runMigration() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, '03_mantenimientos.sql'), 'utf8');
        await db.query(sql);
        console.log("Migration executed successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

runMigration();
