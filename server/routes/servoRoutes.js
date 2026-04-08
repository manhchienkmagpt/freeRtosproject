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
const db = require('../database/db_mysql');

// =====================================================
// POST /api/servo/open - Log servo open event
// =====================================================

router.post('/open', async (req, res) => {
    try {
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
        await db.insert(
            `INSERT INTO servo_events (event_id, gate_type, action, status, servo_angle, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [event_id, gate_type, action, status, servo_angle || 90, event_timestamp]
        );
        
        // Update servo status
        await db.update(
            `UPDATE servo_status 
             SET current_position = ?, is_open = 0, last_action = ?, last_action_time = ?, total_operations = total_operations + 1
             WHERE gate_type = ?`,
            [servo_angle || 90, action, event_timestamp, gate_type]
        );
        
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
    } catch (error) {
        console.error('[ERROR] Servo open error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// POST /api/servo/close - Log servo close event
// =====================================================

router.post('/close', async (req, res) => {
    try {
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
        await db.insert(
            `INSERT INTO servo_events (event_id, gate_type, action, status, servo_angle, timestamp)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [event_id, gate_type, action, status, servo_angle || 0, event_timestamp]
        );
        
        // Update servo status
        await db.update(
            `UPDATE servo_status 
             SET current_position = ?, is_open = 1, last_action = ?, last_action_time = ?, total_operations = total_operations + 1
             WHERE gate_type = ?`,
            [servo_angle || 0, action, event_timestamp, gate_type]
        );
        
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
    } catch (error) {
        console.error('[ERROR] Servo close error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/servo/status - Get current servo status
// =====================================================

router.get('/status', async (req, res) => {
    try {
        const servos = await db.all('SELECT * FROM servo_status ORDER BY gate_id', []);
        
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
    } catch (error) {
        console.error('[ERROR] Get servo status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/servo/history - Get servo event history
// =====================================================

router.get('/history', async (req, res) => {
    try {
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
        
        query += ` ORDER BY timestamp DESC LIMIT ${Math.max(1, limit)}`;
        
        const events = await db.all(query, params);
        
        res.json({
            total_events: events.length,
            limit,
            gate_type: gate_type || 'all',
            events,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get servo history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/servo/statistics - Get servo statistics
// =====================================================

router.get('/statistics', async (req, res) => {
    try {
        const query_period = req.query.period || 'daily'; // daily, weekly, monthly
        
        let date_filter = '';
        if (query_period === 'daily') {
            date_filter = "DATE(timestamp) = CURDATE()";
        } else if (query_period === 'weekly') {
            date_filter = "DATE(timestamp) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
        } else if (query_period === 'monthly') {
            date_filter = "YEAR(timestamp) = YEAR(NOW()) AND MONTH(timestamp) = MONTH(NOW())";
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
        
        const stats = await db.all(stats_query, []);
        
        res.json({
            period: query_period,
            timestamp: new Date(),
            statistics: stats,
            message: 'Servo event statistics'
        });
    } catch (error) {
        console.error('[ERROR] Get servo statistics error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
