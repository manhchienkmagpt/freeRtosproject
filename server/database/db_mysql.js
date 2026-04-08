/*
 * Database Connection Module for MySQL 8.0
 * Initializes database and creates tables using init_database.sql
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// =====================================================
// MYSQL POOL CONFIGURATION
// =====================================================

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'chien123',
    database: process.env.MYSQL_DATABASE || 'parking_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true
});

// =====================================================
// DATABASE INITIALIZATION
// =====================================================

async function initializeDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('[DATABASE] Connected to MySQL successfully');
        
        // Read and execute init_database.sql
        const sqlScript = fs.readFileSync(
            path.join(__dirname, 'init_database.sql'),
            'utf8'
        );
        
        // Split by semicolon and execute each statement
        const statements = sqlScript
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        for (const statement of statements) {
            try {
                await connection.execute(statement);
            } catch (err) {
                // Ignore errors about existing databases/tables
                if (!err.message.includes('already exists') && 
                    !err.message.includes('ER_DB_CREATE_EXISTS')) {
                    console.error('[DB] Error executing statement:', err.message);
                }
            }
        }
        
        console.log('[DATABASE] ✓ All tables initialized successfully!');
        connection.release();
        
    } catch (err) {
        console.error('[DATABASE] Initialization error:', err.message);
        if (connection) connection.release();
        process.exit(1);
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Execute query with parameters
const db = {};

db.execute = async (sql, params = []) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute(sql, params);
        connection.release();
        return result;
    } catch (err) {
        if (connection) connection.release();
        console.error('[DB ERROR]', err.message);
        throw err;
    }
};

// Query (SELECT)
db.query = async (sql, params = []) => {
    return db.execute(sql, params);
};

// Get single row
db.get = async (sql, params = []) => {
    const results = await db.execute(sql, params);
    return results.length > 0 ? results[0] : null;
};

// Get all rows
db.all = async (sql, params = []) => {
    return db.execute(sql, params);
};

// Insert
db.insert = async (sql, params = []) => {
    const result = await db.execute(sql, params);
    return {
        insertId: result.insertId,
        affectedRows: result.affectedRows
    };
};

// Update
db.update = async (sql, params = []) => {
    const result = await db.execute(sql, params);
    return {
        affectedRows: result.affectedRows,
        changedRows: result.changedRows
    };
};

// Delete
db.delete = async (sql, params = []) => {
    const result = await db.execute(sql, params);
    return {
        affectedRows: result.affectedRows
    };
};

// Initialize database on startup
(async () => {
    await initializeDatabase();
})();

module.exports = db;
