/*
 * Database Adapter - Universal interface for MySQL and SQLite
 * Provides callback-based interface for routes
 */

require('dotenv').config();
const dbType = process.env.DATABASE_TYPE || 'mysql';

let db;

if (dbType === 'mysql') {
    // =====================================================
    // MYSQL ADAPTER
    // =====================================================
    const mysql = require('mysql2/promise');
    const fs = require('fs');
    const path = require('path');
    
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'chien123',
        database: process.env.MYSQL_DATABASE || 'parking_system',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    db = {
        pool: pool,

        // Callback-based execute (for INSERT/UPDATE/DELETE)
        run: (sql, params = [], callback) => {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            pool.getConnection().then(conn => {
                conn.execute(sql, params)
                    .then((result) => {
                        conn.release();
                        if (callback) {
                            callback.call({ id: result[0].insertId }, null);
                        }
                    })
                    .catch((err) => {
                        conn.release();
                        if (callback) callback.call({ id: null }, err);
                    });
            }).catch((err) => {
                if (callback) callback(err);
            });
        },

        // Callback-based get (single row)
        get: (sql, params = [], callback) => {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            pool.getConnection().then(conn => {
                conn.execute(sql, params)
                    .then((result) => {
                        conn.release();
                        const [rows] = result;
                        if (callback) callback(null, rows.length > 0 ? rows[0] : null);
                    })
                    .catch((err) => {
                        conn.release();
                        if (callback) callback(err);
                    });
            }).catch((err) => {
                if (callback) callback(err);
            });
        },

        // Callback-based all (multiple rows)
        all: (sql, params = [], callback) => {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            
            pool.getConnection().then(conn => {
                conn.execute(sql, params)
                    .then((result) => {
                        conn.release();
                        const [rows] = result;
                        if (callback) callback(null, rows);
                    })
                    .catch((err) => {
                        conn.release();
                        if (callback) callback(err);
                    });
            }).catch((err) => {
                if (callback) callback(err);
            });
        },

        // Close pool
        close: () => {
            return pool.end();
        }
    };

    // Initialize database on startup
    (async () => {
        let connection;
        try {
            connection = await pool.getConnection();
            console.log('[DATABASE] ✓ Connected to MySQL successfully');
            
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
                        !err.message.includes('ER_DB_CREATE_EXISTS') &&
                        !err.message.includes('Duplicate')) {
                        // console.error('[DB] Error:', err.message);
                    }
                }
            }
            
            console.log('[DATABASE] ✓ All tables initialized!');
            connection.release();
            
        } catch (err) {
            console.error('[DATABASE] Initialization error:', err.message);
            if (connection) connection.release();
        }
    })();

} else {
    // =====================================================
    // SQLITE ADAPTER (Legacy)
    // =====================================================
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    const DB_PATH = path.join(__dirname, 'parking_system.db');
    
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('[DATABASE] Connection error:', err.message);
            process.exit(1);
        } else {
            console.log('[DATABASE] Connected to SQLite database');
        }
    });
    
    db.run('PRAGMA foreign_keys = ON');
}

module.exports = db;
