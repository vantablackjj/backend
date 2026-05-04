const Notification = require('../models/Notification');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');


exports.getAll = async (req, res) => {
  try {
    let where = {};
    
    // Role-based filtering: 
    // ADMIN sees all. 
    // STAFF sees their warehouse notifications AND filtered categories.
    if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        where.warehouse_id = req.user.warehouse_id;

        // Granular permission filtering
        const allowedTypes = ['SYSTEM', 'INFO', 'IMPORT_EXCEL']; // Default public types
        
        if (req.user.can_manage_sales) {
            allowedTypes.push(
                'RETAIL_SALE', 
                'WHOLESALE_SALE', 
                'TRANSFER_REQUEST', 
                'TRANSFER_APPROVED', 
                'TRANSFER_RECEIVED',
                'PURCHASE' // Vehicle purchase
            );
        }
        
        if (req.user.can_manage_spare_parts) {
            allowedTypes.push(
                'LOW_STOCK', 
                'PART_TRANSFER', 
                'PART_PURCHASE'
            );
        }

        if (req.user.can_manage_expenses) {
            allowedTypes.push('EXPENSE');
        }

        // Apply type filtering
        const { Op } = require('sequelize');
        where.type = { [Op.in]: allowedTypes };
    }

    const { is_read } = req.query;
    if (is_read !== undefined) {
        where.is_read = is_read === 'true';
    }

    const list = await Notification.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 50,
      include: [
        { model: User, as: 'creator', attributes: ['full_name'] },
        { model: Warehouse, attributes: ['warehouse_name'] }
      ]

    });


    const unreadCount = await Notification.count({ where: { ...where, is_read: false } });

    res.json({ list, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await Notification.update({ is_read: true }, { where: { is_read: false } });
    } else {
      await Notification.update({ is_read: true }, { where: { id } });
    }
    res.json({ message: 'Đã đánh dấu đã đọc' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Hàm tiện ích để tạo thông báo (chỉ dùng nội bộ trong backend hoặc exported)
exports.createNotification = async (data) => {
    try {
        await Notification.create(data);
    } catch (e) {
        console.error('Error creating notification:', e);
    }
};
