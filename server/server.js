/*
 * =====================================================
 * SMART PARKING SYSTEM - BACKEND SERVER
 * =====================================================
 * 
 * Technology Stack:
 * - Runtime: Node.js
 * - Framework: Express.js
 * - Database: MySQL 8.0
 * 
 * Port: 5000
 * Database: parking_system (MySQL)
 * 
 * Features:
 * - Servo gate control via Bluetooth
 * - Parking slot status tracking
 * - Alarm logging (smoke/flame detection)
 * - Real-time statistics
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const moment = require('moment');

// Database initialization
const db = require('./database/db_mysql');

// Route imports
const vehicleRoutes = require('./routes/vehicleRoutes');
const alarmRoutes = require('./routes/alarmRoutes');
const servoRoutes = require('./routes/servoRoutes');
const slotRoutes = require('./routes/slotRoutes');

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

app.use('/api/vehicle', vehicleRoutes);
app.use('/api/alarm', alarmRoutes);
app.use('/api/servo', servoRoutes);
app.use('/api/slots', slotRoutes);

// System status endpoint
app.get('/api/system/status', async (req, res) => {
    try {
        const vehicleCount = await db.get('SELECT COUNT(*) as total_vehicles FROM vehicles_log');
        const slotCount = await db.get('SELECT COUNT(*) as occupied_slots FROM parking_slots WHERE is_occupied = 1');
        const revenue = await db.get('SELECT SUM(payment_amount) as total_revenue FROM vehicles_log WHERE payment_status = "completed"');
        
        res.json({
            status: 'OK',
            timestamp: new Date(),
            total_vehicles_processed: vehicleCount.total_vehicles || 0,
            occupied_slots: slotCount.occupied_slots || 0,
            total_available_slots: 6,
            total_revenue: revenue.total_revenue || 0,
            uptime_seconds: Math.floor(process.uptime())
        });
    } catch (err) {
        console.error('[ERROR] /api/system/status:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Parking status endpoint
app.get('/api/parking-status', async (req, res) => {
    try {
        const slots = await db.all('SELECT * FROM parking_slots ORDER BY slot_id');
        
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
    } catch (err) {
        console.error('[ERROR] /api/parking-status:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Statistics endpoints
app.get('/api/statistics/daily', async (req, res) => {
    try {
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
        
        const data = await db.get(query, [today]);
        
        res.json({
            date: today,
            vehicles_count: data.vehicles_count || 0,
            revenue: data.revenue || 0,
            avg_duration_minutes: Math.round((data.avg_duration_minutes || 0) * 100) / 100,
            first_entry: data.first_entry,
            last_exit: data.last_exit,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[ERROR] /api/statistics/daily:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/statistics/hourly', async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        
        const query = `
            SELECT 
                HOUR(entry_time) as hour,
                COUNT(*) as vehicles_count,
                SUM(CASE WHEN payment_status = 'completed' THEN payment_amount ELSE 0 END) as revenue
            FROM vehicles_log
            WHERE DATE(entry_time) = ?
            GROUP BY HOUR(entry_time)
            ORDER BY hour ASC
        `;
        
        const data = await db.all(query, [today]);
        
        res.json({
            date: today,
            hourly_data: data || [],
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[ERROR] /api/statistics/hourly:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get all vehicles (with pagination)
app.get('/api/vehicles', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        const countQuery = 'SELECT COUNT(*) as total FROM vehicles_log';
        const dataQuery = `
            SELECT * FROM vehicles_log 
            ORDER BY entry_time DESC 
            LIMIT ? OFFSET ?
        `;
        
        const countResult = await db.get(countQuery);
        const vehicles = await db.all(dataQuery, [limit, offset]);
        
        res.json({
            page,
            limit,
            total: countResult.total || 0,
            total_pages: Math.ceil((countResult.total || 0) / limit),
            vehicles,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[ERROR] /api/vehicles:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get alarm logs
app.get('/api/alarms', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const since = moment().subtract(days, 'days').format('YYYY-MM-DD');
        
        const query = `
            SELECT * FROM alarm_logs
            WHERE DATE(alarm_time) >= ?
            ORDER BY alarm_time DESC
            LIMIT 100
        `;
        
        const alarms = await db.all(query, [since]);
        
        res.json({
            days_back: days,
            total_alarms: alarms.length,
            alarms,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('[ERROR] /api/alarms:', err.message);
        res.status(500).json({ error: err.message });
    }
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
