/*
 * =====================================================
 * SMART PARKING SYSTEM - BACKEND SERVER (REDESIGNED)
 * =====================================================
 * 
 * Technology Stack:
 * - Runtime: Node.js
 * - Framework: Express.js
 * - Database: SQLite3
 * 
 * Port: 5000
 * Database: parking_system.db
 * 
 * Features (Updated for Bluetooth-only architecture):
 * - Servo event logging (open/close)
 * - Servo status tracking
 * - Alarm logging (future)
 * - Real-time statistics
 * - REMOVED: RFID authentication, vehicle entry/exit parking fees
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database initialization (REDESIGNED)
const db = require('./database/db');

// Route imports
const servoRoutes = require('./routes/servoRoutes');
const alarmRoutes = require('./routes/alarmRoutes');

// =====================================================
// CONSTANTS
// =====================================================

const PORT = 5000;
const HOST = '0.0.0.0';

// =====================================================
// EXPRESS APP SETUP
// =====================================================

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ limit: '10kb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] ${req.method} ${req.path}`);
    next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// System status endpoint (UPDATED)
app.get('/api/system/status', (req, res) => {
    db.all('SELECT COUNT(*) as total_events FROM servo_events', (err, events) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.all('SELECT * FROM servo_status', (err, gates) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            db.all('SELECT COUNT(*) as unresolved_alarms FROM alarm_logs WHERE resolved = 0',
                (err, alarms) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    
                    res.json({
                        status: 'OK',
                        timestamp: new Date(),
                        total_servo_events: events[0].total_events || 0,
                        gates: gates || [],
                        unresolved_alarms: alarms[0].unresolved_alarms || 0,
                        uptime_seconds: Math.floor(process.uptime())
                    });
                }
            );
        });
    });
});

// Servo management routes (PRIORITY)
app.use('/api/servo', servoRoutes);

// Alarm management routes (KEPT for future)
app.use('/api/alarm', alarmRoutes);

// Parking status endpoint (LEGACY - kept for compatibility)
app.get('/api/parking-status', (req, res) => {
    db.all('SELECT * FROM parking_slots ORDER BY slot_id', (err, slots) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const occupied = slots ? slots.filter(s => s.is_occupied).length : 0;
        const available = slots ? slots.length - occupied : 6;
        
        res.json({
            total_slots: slots ? slots.length : 6,
            occupied_slots: occupied,
            available_slots: available,
            occupancy_percentage: slots ? Math.round((occupied / slots.length) * 100) : 0,
            slots: slots || [],
            timestamp: new Date()
        });
    });
});

// =====================================================
// SERVO STATISTICS (NEW)
// =====================================================

app.get('/api/servo/daily-summary', (req, res) => {
    const today = moment().format('YYYY-MM-DD');
    
    const query = `
        SELECT 
            gate_type,
            action,
            COUNT(*) as count,
            MIN(timestamp) as first_action,
            MAX(timestamp) as last_action
        FROM servo_events
        WHERE DATE(timestamp) = ?
        GROUP BY gate_type, action
        ORDER BY gate_type, action
    `;
    
    db.all(query, [today], (err, data) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            date: today,
            summary: data || [],
            timestamp: new Date()
        });
    });
});

// =====================================================
// ALARM ENDPOINTS (LEGACY - kept for compatibility)
// =====================================================

app.get('/api/statistics/daily', (req, res) => {
    const today = moment().format('YYYY-MM-DD');
    
    const query = `
        SELECT 
            COUNT(*) as servo_events,
            MIN(timestamp) as first_event,
            MAX(timestamp) as last_event
        FROM servo_events
        WHERE DATE(timestamp) = ?
    `;
    
    db.get(query, [today], (err, data) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            date: today,
            servo_events: data.servo_events || 0,
            first_event: data.first_event,
            last_event: data.last_event,
            timestamp: new Date()
        });
    });
});

// Test endpoint - trigger servo open event manually
app.post('/api/test/servo-open', (req, res) => {
    const { gate_type } = req.body;
    
    if (!gate_type || !['GATE_IN', 'GATE_OUT'].includes(gate_type)) {
        return res.status(400).json({ error: 'Invalid gate_type' });
    }
    
    // Forward to servo routes
    res.redirect(307, '/api/servo/open');
});

// Test endpoint - trigger servo close event manually
app.post('/api/test/servo-close', (req, res) => {
    const { gate_type } = req.body;
    
    if (!gate_type || !['GATE_IN', 'GATE_OUT'].includes(gate_type)) {
        return res.status(400).json({ error: 'Invalid gate_type' });
    }
    
    // Forward to servo routes
    res.redirect(307, '/api/servo/close');
});

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// =====================================================
// SERVER START
// =====================================================

app.listen(PORT, HOST, () => {
    console.log('\n========================================');
    console.log('🚀 SMART PARKING SERVER STARTED');
    console.log('========================================');
    console.log(`Port: ${PORT}`);
    console.log(`Host: ${HOST}`);
    console.log(`Time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Database: ${path.join(__dirname, 'database/parking_system.db')}`);
    console.log('\n📡 API Endpoints:');
    console.log('  GET  /health');
    console.log('  GET  /api/system/status');
    console.log('  POST /api/servo/open');
    console.log('  POST /api/servo/close');
    console.log('  GET  /api/servo/status');
    console.log('  GET  /api/servo/history');
    console.log('  GET  /api/servo/statistics');
    console.log('  GET  /api/servo/daily-summary');
    console.log('  GET  /api/alarm/*');
    console.log('\n========================================\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
