/*
 * =====================================================
 * SMART PARKING SYSTEM - BACKEND SERVER
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
 * Features:
 * - Vehicle entry/exit management
 * - Parking slot status tracking
 * - Alarm logging
 * - Payment processing (simulation)
 * - Real-time statistics
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database initialization
const db = require('./database/db');

// Route imports
const vehicleRoutes = require('./routes/vehicleRoutes');
const alarmRoutes = require('./routes/alarmRoutes');

// =====================================================
// CONSTANTS
// =====================================================

const PORT = 5000;
const HOST = '0.0.0.0';
const PARKING_FEE_PER_HOUR = 50000;  // 50,000 VND per hour
const GRACE_PERIOD = 5 * 60000;  // 5 minute grace period in ms

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

// System status endpoint
app.get('/api/system/status', (req, res) => {
    db.all('SELECT COUNT(*) as total_vehicles FROM vehicles_log', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.all('SELECT COUNT(*) as occupied_slots FROM parking_slots WHERE is_occupied = 1', 
            (err, slots) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                db.all('SELECT SUM(payment_amount) as total_revenue FROM vehicles_log WHERE payment_status = "completed"',
                    (err, revenue) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }
                        
                        res.json({
                            status: 'OK',
                            timestamp: new Date(),
                            total_vehicles_processed: rows[0].total_vehicles,
                            occupied_slots: slots[0].occupied_slots,
                            total_available_slots: 6,
                            total_revenue: revenue[0].total_revenue || 0,
                            uptime_seconds: Math.floor(process.uptime())
                        });
                    }
                );
            }
        );
    });
});

// Vehicle management routes
app.use('/api/vehicle', vehicleRoutes);

// Alarm management routes
app.use('/api/alarm', alarmRoutes);

// Parking status endpoint
app.get('/api/parking-status', (req, res) => {
    db.all('SELECT * FROM parking_slots ORDER BY slot_id', (err, slots) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const occupied = slots.filter(s => s.is_occupied).length;
        const available = slots.length - occupied;
        
        res.json({
            total_slots: slots.length,
            occupied_slots: occupied,
            available_slots: available,
            occupancy_percentage: Math.round((occupied / slots.length) * 100),
            slots: slots,
            timestamp: new Date()
        });
    });
});

// Statistics endpoints
app.get('/api/statistics/daily', (req, res) => {
    const today = moment().format('YYYY-MM-DD');
    
    const query = `
        SELECT 
            COUNT(*) as vehicles_count,
            SUM(CASE WHEN payment_status = 'completed' THEN payment_amount ELSE 0 END) as revenue,
            AVG(duration_minutes) as avg_duration_minutes,
            MIN(entry_time) as first_entry,
            MAX(exit_time) as last_exit
        FROM vehicles_log
        WHERE DATE(entry_time) = ?
    `;
    
    db.get(query, [today], (err, data) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            date: today,
            vehicles_count: data.vehicles_count || 0,
            revenue: data.revenue || 0,
            avg_duration_minutes: Math.round(data.avg_duration_minutes * 100) / 100,
            first_entry: data.first_entry,
            last_exit: data.last_exit,
            timestamp: new Date()
        });
    });
});

app.get('/api/statistics/hourly', (req, res) => {
    const today = moment().format('YYYY-MM-DD');
    
    const query = `
        SELECT 
            strftime('%H', entry_time) as hour,
            COUNT(*) as vehicles_count,
            SUM(CASE WHEN payment_status = 'completed' THEN payment_amount ELSE 0 END) as revenue
        FROM vehicles_log
        WHERE DATE(entry_time) = ?
        GROUP BY hour
        ORDER BY hour ASC
    `;
    
    db.all(query, [today], (err, data) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            date: today,
            hourly_data: data || [],
            timestamp: new Date()
        });
    });
});

// Get all vehicles (with pagination)
app.get('/api/vehicles', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const countQuery = 'SELECT COUNT(*) as total FROM vehicles_log';
    const dataQuery = `
        SELECT * FROM vehicles_log 
        ORDER BY entry_time DESC 
        LIMIT ? OFFSET ?
    `;
    
    db.get(countQuery, (err, countResult) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        db.all(dataQuery, [limit, offset], (err, vehicles) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                page,
                limit,
                total: countResult.total,
                total_pages: Math.ceil(countResult.total / limit),
                vehicles,
                timestamp: new Date()
            });
        });
    });
});

// Get alarm logs
app.get('/api/alarms', (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const since = moment().subtract(days, 'days').format('YYYY-MM-DD');
    
    const query = `
        SELECT * FROM alarm_logs
        WHERE DATE(alarm_time) >= ?
        ORDER BY alarm_time DESC
        LIMIT 100
    `;
    
    db.all(query, [since], (err, alarms) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            days_back: days,
            total_alarms: alarms.length,
            alarms,
            timestamp: new Date()
        });
    });
});

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// =====================================================
// SERVER STARTUP
// =====================================================

app.listen(PORT, HOST, () => {
    console.log('\n=== SMART PARKING SYSTEM - BACKEND SERVER ===\n');
    console.log(`[SERVER] Listening on ${HOST}:${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[DATABASE] Connected to: parking_system.db`);
    console.log(`[TIME] Started at: ${moment().format('YYYY-MM-DD HH:mm:ss')} \n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('[ERROR]', err.message);
        }
        process.exit(0);
    });
});

module.exports = app;
