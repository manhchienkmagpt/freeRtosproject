/*
 * Slot Routes - Handles parking slot intensity and status
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db_mysql');
const { v4: uuidv4 } = require('uuid');

// =====================================================
// POST /api/slots/update - Update all 6 slots status
// =====================================================

router.post('/update', async (req, res) => {
    try {
        const { parking_slots, timestamp } = req.body;
        
        if (!parking_slots || !Array.isArray(parking_slots)) {
            return res.status(400).json({ error: 'Parking slots array required' });
        }
        
        let changed = false;
        const changes = [];
        
        // Update each slot in database
        for (let index = 0; index < parking_slots.length; index++) {
            const is_occupied = parking_slots[index];
            const slot_id = index + 1;
            
            try {
                // Check if status actually changed
                const current = await db.get(
                    'SELECT is_occupied FROM parking_slots WHERE slot_id = ?',
                    [slot_id]
                );
                
                const statusChanged = current && current.is_occupied !== (is_occupied ? 1 : 0);
                
                // Update master table with current timestamp
                await db.execute(
                    `UPDATE parking_slots 
                     SET is_occupied = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE slot_id = ?`,
                    [is_occupied ? 1 : 0, slot_id]
                );
                
                if (statusChanged || !current) {
                    changed = true;
                    changes.push({
                        slot_id,
                        is_occupied,
                        updated_at: new Date()
                    });
                }
                
                console.log(`[SLOTS] Slot ${slot_id} updated - is_occupied: ${is_occupied}`);
            } catch (err) {
                console.error(`[ERROR] Failed to update slot ${slot_id}:`, err.message);
            }
        }
        
        console.log(`[SLOTS] Updated states for ${parking_slots.length} slots`);
        
        // Broadcast real-time update to all connected WebSocket clients
        if (changed && req.app.locals.io) {
            const slots = await db.all(
                'SELECT slot_id, is_occupied, updated_at FROM parking_slots ORDER BY slot_id',
                []
            );
            
            const occupied = slots.filter(s => s.is_occupied).length;
            const available = slots.length - occupied;
            
            req.app.locals.io.emit('slotStatusUpdate', {
                total_slots: slots.length,
                occupied_slots: occupied,
                available_slots: available,
                occupancy_percentage: Math.round((occupied / slots.length) * 100),
                slots: slots,
                changes: changes,
                timestamp: new Date()
            });
            
            console.log(`[WS] Broadcasting slot status update to all clients`);
        }
        
        res.status(200).json({ 
            status: 'OK', 
            message: 'Slots updated successfully',
            slots_updated: parking_slots.length,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Slot update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// GET /api/slots - Get all parking slots status
// =====================================================

router.get('/', async (req, res) => {
    try {
        const slots = await db.all(
            'SELECT slot_id, is_occupied, updated_at FROM parking_slots ORDER BY slot_id',
            []
        );
        
        res.json({
            total_slots: slots.length,
            occupied_slots: slots.filter(s => s.is_occupied).length,
            available_slots: slots.filter(s => !s.is_occupied).length,
            slots,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ERROR] Get slots error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
