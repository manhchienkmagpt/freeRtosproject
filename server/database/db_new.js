/*
 * Database Connection Module for SQLite3 - REDESIGNED VERSION
 * Bluetooth-Only Servo Control System
 * 
 * Changes from original:
 * - REMOVED: RFID authentication concepts
 * - REMOVED: users, rfid_cards, vehicles_log tables
 * - ADDED: servo_events table for logging servo actions
 * - ADDED: servo_status table for current gate state
 * - KEPT: alarm_logs for smoke/flame detection
 * - KEPT: parking_slots for future occupancy tracking (optional)
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
    
    // =====================================================
    // SERVO EVENTS TABLE - New core table
    // =====================================================
    db.run(`
        CREATE TABLE IF NOT EXISTS servo_events (
            event_id TEXT PRIMARY KEY,
            gate_type TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT DEFAULT 'SUCCESS',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            servo_angle INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('[DB] Servo events table error:', err);
        else console.log('[DB] Servo events table ready');
        
        // Create index on gate_type for faster queries
        db.run('CREATE INDEX IF NOT EXISTS idx_servo_gate_type ON servo_events(gate_type)');
        db.run('CREATE INDEX IF NOT EXISTS idx_servo_timestamp ON servo_events(timestamp)');
    });
    
    // =====================================================
    // SERVO STATUS TABLE - Track current state
    // =====================================================
    db.run(`
        CREATE TABLE IF NOT EXISTS servo_status (
            gate_id INTEGER PRIMARY KEY,
            gate_type TEXT UNIQUE NOT NULL,
            current_position INTEGER DEFAULT 0,
            is_open INTEGER DEFAULT 0,
            last_action TEXT,
            last_action_time DATETIME,
            total_operations INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('[DB] Servo status table error:', err);
        else console.log('[DB] Servo status table ready');
        
        // Insert initial servo status if they don't exist
        db.run(
            'INSERT OR IGNORE INTO servo_status (gate_id, gate_type, current_position, is_open) VALUES (?, ?, ?, ?)',
            [1, 'GATE_IN', 0, 0],
            (err) => {
                if (err) console.error('[DB] Insert GATE_IN status error:', err);
            }
        );
        
        db.run(
            'INSERT OR IGNORE INTO servo_status (gate_id, gate_type, current_position, is_open) VALUES (?, ?, ?, ?)',
            [2, 'GATE_OUT', 0, 0],
            (err) => {
                if (err) console.error('[DB] Insert GATE_OUT status error:', err);
            }
        );
    });
    
    // =====================================================
    // ALARM LOGS TABLE - Keep for future monitoring
    // =====================================================
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
        
        // Create index on alarm_type for faster queries
        db.run('CREATE INDEX IF NOT EXISTS idx_alarm_type ON alarm_logs(alarm_type)');
    });
    
    // =====================================================
    // PARKING SLOTS TABLE - Optional for future expansion
    // =====================================================
    db.run(`
        CREATE TABLE IF NOT EXISTS parking_slots (
            slot_id INTEGER PRIMARY KEY,
            slot_name TEXT UNIQUE NOT NULL,
            is_occupied INTEGER DEFAULT 0,
            current_vehicle_id TEXT,
            entry_time DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    
    console.log('[DATABASE] Initialization completed - Bluetooth-only architecture');
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
