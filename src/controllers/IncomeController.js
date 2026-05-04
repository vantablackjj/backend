const Income = require('../models/Income');
const Vehicle = require('../models/Vehicle');
const Warehouse = require('../models/Warehouse');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { sendNotification } = require('../utils/notificationHelper');
const dayjs = require('dayjs');

exports.getAll = async (req, res) => {
  try {
    const { from_date, to_date, warehouse_id, query } = req.query;
    let where = {};
    
    // Auth filtering
    if (req.user.role !== 'ADMIN') {
      where.is_internal = { [Op.ne]: true };
    }

    if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
      where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }

    // Custom filtering
    if (warehouse_id) {
        where.warehouse_id = warehouse_id;
    }

    if (from_date && to_date) {
        where[Op.and] = [
            sequelize.where(
                sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('income_date'))),
                { [Op.between]: [from_date, to_date] }
            )
        ];
    } else if (from_date) {
        where[Op.and] = [
            sequelize.where(
                sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('income_date'))),
                { [Op.gte]: from_date }
            )
        ];
    } else if (to_date) {
        where[Op.and] = [
            sequelize.where(
                sequelize.fn('date', sequelize.fn('timezone', 'Asia/Ho_Chi_Minh', sequelize.col('income_date'))),
                { [Op.lte]: to_date }
            )
        ];
    }

    let include = [
        { model: Vehicle, as: 'related_vehicle', attributes: ['engine_no', 'chassis_no'] },
        { model: Warehouse, attributes: ['warehouse_name'] }
    ];

    if (query) {
        where[Op.or] = [
            { content: { [Op.like]: `%${query}%` } },
            { '$related_vehicle.engine_no$': { [Op.like]: `%${query}%` } },
            { '$related_vehicle.chassis_no$': { [Op.like]: `%${query}%` } }
        ];
    }

    const list = await Income.findAll({ 
      where,
      order: [['income_date', 'DESC']],
      include
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = { ...req.body };
    const warehouse_id = data.warehouse_id || req.user.warehouse_id;
    
    // Permission check: Admin/Manager can do anything. Others must check allowedWarehouses.
    if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        if (!warehouse_id || !req.user.allowedWarehouses.includes(warehouse_id)) {
            return res.status(403).json({ message: "Bạn không có quyền thực hiện tại kho này" });
        }
    }

    data.warehouse_id = warehouse_id || null;
    const income = await Income.create(data);
    
    // Notification: New Income
    const warehouseObj = data.warehouse_id || req.user.warehouse_id ? await Warehouse.findByPk(data.warehouse_id || req.user.warehouse_id) : null;
    await sendNotification(req, {
        title: '💰 Khoản thu mới',
        message: `Nhân viên ${req.user.full_name} đã ghi nhận khoản thu ${Number(data.amount).toLocaleString()} đ tại [${warehouseObj?.warehouse_name || 'Toàn hệ thống'}]. Nội dung: ${data.content}.`,
        type: 'INCOME',
        warehouse_id: data.is_internal ? null : (data.warehouse_id || req.user.warehouse_id || null),
        link: '/expenses'
    });

    res.status(201).json(income);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    let where = { id };
    if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
      where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }
    await Income.destroy({ where });
    res.json({ message: 'Đã xóa thu nhập thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
