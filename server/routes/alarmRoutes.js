/*
 * Alarm Routes - Handles fire/smoke alarm alerts
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../database/db_mysql');

// =====================================================
// POST /api/alarm/log - Log alarm alert (Bluetooth-Only Version)
// =====================================================

router.post('/log', async (req, res) => {
    try {
        const { alarm_type, sensor_value, timestamp } = req.body;
        
        console.log(`[ALARM] Alert received - Type: ${alarm_type}, Value: ${sensor_value}`);
        
        if (!alarm_type) {
            return res.status(400).json({ error: 'Alarm type is required' });
        }
        
        const alarm_id = uuidv4();
        const alarm_time = timestamp ? new Date(timestamp) : new Date();
        
        // Insert alarm log
        await db.insert(
            `INSERT INTO alarm_logs 
             (alarm_id, alarm_type, sensor_value, alarm_time, resolved)
             VALUES (?, ?, ?, ?, 0)`,
            [alarm_id, alarm_type, sensor_value || 0, alarm_time]
        );
        
        res.status(201).json({
            alarm_id,
            status: 'Alert recorded',
            alarm_type,
            sensor_value,
            timestamp: alarm_time
        });
    } catch (error) {
        console.error('[ERROR] Alarm insert error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/alarm/active - Get active alarms
// =====================================================

router.get('/active', async (req, res) => {
    try {
        const alarms = await db.all(
            `SELECT * FROM alarm_logs 
             WHERE resolved = 0 
             ORDER BY alarm_time DESC`,
            []
        );
        
        res.json({
            active_alarms: alarms.length,
            alarms,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get active alarms error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/alarm/recent - Get recent alarms
// =====================================================

router.get('/recent', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const since = moment().subtract(hours, 'hours').format('YYYY-MM-DD HH:mm:ss');
        
        const alarms = await db.all(
            `SELECT * FROM alarm_logs 
             WHERE alarm_time >= ?
             ORDER BY alarm_time DESC
             LIMIT 100`,
            [since]
        );
        
        const stats = {
            total: alarms.length,
            smoke_alarms: alarms.filter(a => a.alarm_type === 'SMOKE').length,
            flame_alarms: alarms.filter(a => a.alarm_type === 'FLAME').length,
            active: alarms.filter(a => a.resolved === 0).length,
            resolved: alarms.filter(a => a.resolved === 1).length
        };
        
        res.json({
            period_hours: hours,
            statistics: stats,
            alarms,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get recent alarms error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/alarm/all - Get all alarm logs
// =====================================================

router.get('/all', async (req, res) => {
    try {
        const alarms = await db.all(
            `SELECT * FROM alarm_logs ORDER BY alarm_time DESC`,
            []
        );
        
        res.json({
            total_alarms: alarms.length,
            alarms,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get all alarms error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PUT /api/alarm/:alarm_id/resolve - Resolve alarm
// =====================================================

router.put('/:alarm_id/resolve', async (req, res) => {
    try {
        const { alarm_id } = req.params;
        const { action_taken, notes, resolved_by } = req.body;
        
        console.log(`[ALARM] Resolving alarm: ${alarm_id}`);
        
        await db.update(
            `UPDATE alarm_logs 
             SET resolved = 1, resolved_time = CURRENT_TIMESTAMP, action_taken = ?, notes = ?, resolved_by = ?
             WHERE alarm_id = ?`,
            [action_taken || 'Manual resolve', notes || '', resolved_by || 'System', alarm_id]
        );
        
        res.json({
            alarm_id,
            status: 'Resolved',
            resolved_at: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Alarm resolve error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// DELETE /api/alarm/:alarm_id - Delete alarm record
// =====================================================

router.delete('/:alarm_id', async (req, res) => {
    try {
        const { alarm_id } = req.params;
        
        console.log(`[ALARM] Deleting alarm: ${alarm_id}`);
        
        await db.delete(
            'DELETE FROM alarm_logs WHERE alarm_id = ?',
            [alarm_id]
        );
        
        res.json({
            alarm_id,
            status: 'Deleted'
        });
    } catch (error) {
        console.error('[ERROR] Alarm delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
