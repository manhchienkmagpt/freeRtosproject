/*
 * Servo Event Routes - Handles servo open/close operations
 * 
 * NEW ROUTES FOR BLUETOOTH-ONLY ARCHITECTURE
 * - POST /api/servo/open - Log servo open event
 * - POST /api/servo/close - Log servo close event
 * - GET /api/servo/status - Get current servo status
 * - GET /api/servo/history - Get servo event history
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../database/db');

// =====================================================
// POST /api/servo/open - Log servo open event
// =====================================================

router.post('/open', (req, res) => {
    const { gate_type, servo_angle, timestamp } = req.body;
    
    console.log(`[SERVO] Open request - Gate: ${gate_type}, Angle: ${servo_angle || 'N/A'}`);
    
    // Validate input
    if (!gate_type || !['GATE_IN', 'GATE_OUT'].includes(gate_type)) {
        return res.status(400).json({ 
            error: 'Invalid gate_type. Must be GATE_IN or GATE_OUT' 
        });
    }
    
    const event_id = uuidv4();
    const event_timestamp = timestamp ? new Date(timestamp) : new Date();
    const action = 'OPEN';
    const status = 'SUCCESS';
    
    // Insert servo event
    db.run(
        `INSERT INTO servo_events (event_id, gate_type, action, status, servo_angle, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [event_id, gate_type, action, status, servo_angle || 90, event_timestamp],
        function(err) {
            if (err) {
                console.error('[ERROR] Servo event insert error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Update servo status
            db.run(
                `UPDATE servo_status 
                 SET current_position = ?, is_open = 1, last_action = ?, last_action_time = ?, total_operations = total_operations + 1
                 WHERE gate_type = ?`,
                [servo_angle || 90, action, event_timestamp, gate_type],
                function(err) {
                    if (err) {
                        console.error('[ERROR] Status update error:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    console.log(`[SERVO] Open event recorded - ID: ${event_id}, Gate: ${gate_type}`);
                    
                    res.status(201).json({
                        event_id,
                        gate_type,
                        action,
                        servo_angle: servo_angle || 90,
                        status,
                        timestamp: event_timestamp,
                        message: 'Servo open event recorded'
                    });
                }
            );
        }
    );
});

// =====================================================
// POST /api/servo/close - Log servo close event
// =====================================================

router.post('/close', (req, res) => {
    const { gate_type, servo_angle, timestamp } = req.body;
    
    console.log(`[SERVO] Close request - Gate: ${gate_type}, Angle: ${servo_angle || 'N/A'}`);
    
    // Validate input
    if (!gate_type || !['GATE_IN', 'GATE_OUT'].includes(gate_type)) {
        return res.status(400).json({ 
            error: 'Invalid gate_type. Must be GATE_IN or GATE_OUT' 
        });
    }
    
    const event_id = uuidv4();
    const event_timestamp = timestamp ? new Date(timestamp) : new Date();
    const action = 'CLOSE';
    const status = 'SUCCESS';
    
    // Insert servo event
    db.run(
        `INSERT INTO servo_events (event_id, gate_type, action, status, servo_angle, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [event_id, gate_type, action, status, servo_angle || 0, event_timestamp],
        function(err) {
            if (err) {
                console.error('[ERROR] Servo event insert error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            // Update servo status
            db.run(
                `UPDATE servo_status 
                 SET current_position = ?, is_open = 0, last_action = ?, last_action_time = ?, total_operations = total_operations + 1
                 WHERE gate_type = ?`,
                [servo_angle || 0, action, event_timestamp, gate_type],
                function(err) {
                    if (err) {
                        console.error('[ERROR] Status update error:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    
                    console.log(`[SERVO] Close event recorded - ID: ${event_id}, Gate: ${gate_type}`);
                    
                    res.status(201).json({
                        event_id,
                        gate_type,
                        action,
                        servo_angle: servo_angle || 0,
                        status,
                        timestamp: event_timestamp,
                        message: 'Servo close event recorded'
                    });
                }
            );
        }
    );
});

// =====================================================
// GET /api/servo/status - Get current servo status
// =====================================================

router.get('/status', (req, res) => {
    db.all('SELECT * FROM servo_status ORDER BY gate_id', (err, servos) => {
        if (err) {
            console.error('[ERROR] Status query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Format response
        const status_data = {};
        servos.forEach(servo => {
            status_data[servo.gate_type] = {
                gate_id: servo.gate_id,
                gate_type: servo.gate_type,
                current_position: servo.current_position,
                is_open: servo.is_open === 1,
                last_action: servo.last_action,
                last_action_time: servo.last_action_time,
                total_operations: servo.total_operations,
                updated_at: servo.updated_at
            };
        });
        
        res.json({
            timestamp: new Date(),
            gates: status_data,
            message: 'Current servo status'
        });
    });
});

// =====================================================
// GET /api/servo/history - Get servo event history
// =====================================================

router.get('/history', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    const gate_type = req.query.gate_type; // Optional filter
    
    let query = 'SELECT * FROM servo_events';
    let params = [];
    
    if (gate_type) {
        if (!['GATE_IN', 'GATE_OUT'].includes(gate_type)) {
            return res.status(400).json({ 
                error: 'Invalid gate_type parameter' 
            });
        }
        query += ' WHERE gate_type = ?';
        params.push(gate_type);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    db.all(query, params, (err, events) => {
        if (err) {
            console.error('[ERROR] History query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            count: events.length,
            timestamp: new Date(),
            events: events,
            message: 'Servo event history'
        });
    });
});

// =====================================================
// GET /api/servo/statistics - Get servo statistics
// =====================================================

router.get('/statistics', (req, res) => {
    const query_period = req.query.period || 'daily'; // daily, weekly, monthly
    
    let date_filter = '';
    if (query_period === 'daily') {
        date_filter = "DATE(timestamp) = DATE('now')";
    } else if (query_period === 'weekly') {
        date_filter = "DATE(timestamp, '-7 days') <= DATE('now')";
    } else if (query_period === 'monthly') {
        date_filter = "strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')";
    }
    
    const stats_query = `
        SELECT 
            gate_type,
            action,
            COUNT(*) as count,
            MIN(timestamp) as first_action,
            MAX(timestamp) as last_action
        FROM servo_events
        WHERE ${date_filter}
        GROUP BY gate_type, action
    `;
    
    db.all(stats_query, (err, stats) => {
        if (err) {
            console.error('[ERROR] Statistics query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json({
            period: query_period,
            timestamp: new Date(),
            statistics: stats,
            message: 'Servo event statistics'
        });
    });
});

module.exports = router;
