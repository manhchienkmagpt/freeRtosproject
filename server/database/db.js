/*
 * Database Connection Module for SQLite3
 * Initializes database and creates tables if needed
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'parking_system.db');

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[DATABASE] Connection error:', err.message);
        process.exit(1);
    } else {
        console.log('[DATABASE] Connected to SQLite database');
        initializeDatabase();
    }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// =====================================================
// DATABASE INITIALIZATION
// =====================================================

function initializeDatabase() {
    // Check if tables exist, if not create them
    
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            rfid_uid TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            phone_number TEXT,
            email TEXT,
            account_balance REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('[DB] Users table error:', err);
        else console.log('[DB] Users table ready');
    });
    
    // RFID Cards table
    db.run(`
        CREATE TABLE IF NOT EXISTS rfid_cards (
            card_id TEXT PRIMARY KEY,
            rfid_uid TEXT UNIQUE NOT NULL,
            user_id TEXT,
            card_status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    `, (err) => {
        if (err) console.error('[DB] RFID Cards table error:', err);
        else console.log('[DB] RFID Cards table ready');
    });
    
    // Vehicles log table
    db.run(`
        CREATE TABLE IF NOT EXISTS vehicles_log (
            vehicle_id TEXT PRIMARY KEY,
            rfid_uid TEXT NOT NULL,
            user_id TEXT,
            entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            exit_time DATETIME,
            entry_gate TEXT DEFAULT 'main',
            exit_gate TEXT,
            duration_minutes INTEGER,
            payment_amount REAL,
            payment_status TEXT DEFAULT 'pending',
            payment_method TEXT,
            gate_status TEXT DEFAULT 'completed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        )
    `, (err) => {
        if (err) console.error('[DB] Vehicles log table error:', err);
        else console.log('[DB] Vehicles log table ready');
    });
    
    // Parking slots table
    db.run(`
        CREATE TABLE IF NOT EXISTS parking_slots (
            slot_id INTEGER PRIMARY KEY,
            slot_name TEXT UNIQUE NOT NULL,
            is_occupied INTEGER DEFAULT 0,
            current_vehicle_id TEXT,
            entry_time DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(current_vehicle_id) REFERENCES vehicles_log(vehicle_id)
        )
    `, (err) => {
        if (err) console.error('[DB] Parking slots table error:', err);
        else console.log('[DB] Parking slots table ready');
        
        // Insert initial parking slots if they don't exist
        for (let i = 1; i <= 6; i++) {
            db.run(
                'INSERT OR IGNORE INTO parking_slots (slot_id, slot_name, is_occupied) VALUES (?, ?, ?)',
                [i, `Slot-${i}`, 0]
            );
        }
    });
    
    // Alarm logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS alarm_logs (
            alarm_id TEXT PRIMARY KEY,
            alarm_type TEXT NOT NULL,
            sensor_value INTEGER,
            alarm_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved INTEGER DEFAULT 0,
            resolved_time DATETIME,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('[DB] Alarm logs table error:', err);
        else console.log('[DB] Alarm logs table ready');
    });
    
    console.log('[DATABASE] Initialization completed');
}

// =====================================================
// DATABASE HELPER FUNCTIONS
// =====================================================

// Execute query with parameters
db.run = function(sql, params = [], callback) {
    return sqlite3.Database.prototype.run.call(this, sql, params, function(err) {
        if (callback) callback.call(this, err);
    });
};

// Get single row
db.get = function(sql, params = [], callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    return sqlite3.Database.prototype.get.call(this, sql, params, callback);
};

// Get multiple rows
db.all = function(sql, params = [], callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    return sqlite3.Database.prototype.all.call(this, sql, params, callback);
};

// =====================================================
// DATABASE CLOSE
// =====================================================

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('[DATABASE] Close error:', err.message);
        } else {
            console.log('[DATABASE] Connection closed');
        }
    });
});

module.exports = db;
