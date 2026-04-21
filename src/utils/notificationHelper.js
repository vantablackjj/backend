const Notification = require('../models/Notification');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');

/**
 * Utility to fetch and emit a notification
 */
const emitNotification = async (io, notificationId) => {
    if (!io) return;
    try {
        const noti = await Notification.findByPk(notificationId, {
            include: [
                { model: Warehouse, attributes: ['warehouse_name'] },
                { model: User, as: 'creator', attributes: ['full_name'] }
            ]
        });
        
        // Emit to admins
        io.to("admins").emit("notification_new", noti);
        
        // Emit to warehouse specific room
        if (noti.warehouse_id) {
            io.to(`warehouse_${noti.warehouse_id}`).emit("notification_new", noti);
        }
    } catch (e) {
        console.error('Socket Emit Error:', e);
    }
};

/**
 * Creates a low stock notification if quantity is below threshold
 */
exports.checkAndNotifyLowStock = async (io, partName, partCode, currentQty, warehouseId, warehouseName) => {
    const THRESHOLD = 5;
    if (currentQty <= THRESHOLD) {
        try {
            const noti = await Notification.create({
                title: `Cảnh báo tồn kho thấp: ${partCode}`,
                message: `Phụ tùng "${partName}" (${partCode}) tại kho "${warehouseName}" hiện chỉ còn ${Number(currentQty).toLocaleString()} cái.`,
                type: 'LOW_STOCK',
                warehouse_id: warehouseId,
                link: `/part-inventory`
            });
            await emitNotification(io, noti.id);
        } catch (error) {
            console.error('[Notification Error]', error);
        }
    }
};

/**
 * Creates a notification when a new purchase is made
 */
exports.notifyNewPurchase = async (io, purchaseNo, warehouseId, warehouseName, creatorName, creatorId) => {
    try {
        const noti = await Notification.create({
            title: `Nhập kho mới: ${purchaseNo}`,
            message: `Một đơn nhập hàng mới đã được thực hiện bởi ${creatorName} vào kho ${warehouseName}.`,
            type: 'PURCHASE',
            warehouse_id: warehouseId,
            created_by: creatorId,
            link: `/report/parts-purchases`
        });
        await emitNotification(io, noti.id);
    } catch (error) {
        console.error('[Notification Error]', error);
    }
};

/**
 * Generic notification sender
 */
exports.sendNotification = async (req, data) => {
    const io = req?.app?.get('io');
    try {
        const noti = await Notification.create({
            title: data.title,
            message: data.message,
            type: data.type || 'INFO',
            warehouse_id: data.warehouse_id,
            created_by: data.created_by || req?.user?.id,
            link: data.link
        });
        await emitNotification(io, noti.id);
        return noti;
    } catch (error) {
        console.error('[sendNotification Error]', error);
    }
};
