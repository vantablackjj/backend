const Notification = require('../models/Notification');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');

/**
 * Creates a notification in the DB and emits it via Socket.io
 */
exports.sendNotification = async (req, { title, message, type, warehouse_id, link }) => {
    try {
        const io = req.app.get('io');
        
        // 1. Create the notification record
        const notiRecord = await Notification.create({
            title,
            message,
            type: type || 'SYSTEM',
            warehouse_id: warehouse_id || null,
            created_by: req.user ? req.user.id : null,
            link: link || null
        });

        // 2. Fetch the populated notification (with Warehouse and Creator name)
        const fullNoti = await Notification.findByPk(notiRecord.id, {
            include: [
                { model: User, as: 'creator', attributes: ['full_name'] },
                { model: Warehouse, attributes: ['warehouse_name'] }
            ]
        });

        if (io) {
            // Emit to admins ONLY
            io.to("admins").emit('notification_new', fullNoti);
        }
        
        return fullNoti;
    } catch (e) {
        console.error('Failed to send notification:', e);
    }
};
