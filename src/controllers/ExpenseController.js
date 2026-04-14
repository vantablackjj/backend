const Expense = require('../models/Expense');
const Vehicle = require('../models/Vehicle');
const Warehouse = require('../models/Warehouse');
const { Op } = require('sequelize');

exports.getAll = async (req, res) => {
  try {
    let where = {};
    if (req.user.role !== 'ADMIN') {
      if (req.user.expense_warehouses) {
        const warehouseIds = req.user.expense_warehouses.split(',').filter(id => id.trim() !== '');
        where.warehouse_id = { [Op.in]: warehouseIds };
      } else {
        where.warehouse_id = req.user.warehouse_id;
      }
    }

    const list = await Expense.findAll({ 
      where,
      order: [['expense_date', 'DESC']],
      include: [
        { model: Vehicle, as: 'related_vehicle', attributes: ['engine_no', 'chassis_no'] },
        { model: Warehouse, attributes: ['warehouse_name'] }
      ]
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = { ...req.body };
    // Non-admin can only create expenses for their own warehouse
    // Non-admin can only create expenses for their own warehouse or allowed warehouses
    if (req.user.role !== 'ADMIN') {
      if (req.user.expense_warehouses) {
        const warehouseIds = req.user.expense_warehouses.split(',').filter(id => id.trim() !== '');
        // If provided warehouse_id is not in allowed list, default to their primary warehouse_id
        if (data.warehouse_id && !warehouseIds.includes(data.warehouse_id)) {
           return res.status(403).json({ message: 'Bạn không có quyền tạo chi tiêu cho kho này!' });
        }
        if (!data.warehouse_id) {
            data.warehouse_id = req.user.warehouse_id;
        }
      } else {
        data.warehouse_id = req.user.warehouse_id;
      }
    }
    const expense = await Expense.create(data);

    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    let where = { id };
    if (req.user.role !== 'ADMIN') {
      if (req.user.expense_warehouses) {
        const warehouseIds = req.user.expense_warehouses.split(',').filter(id => id.trim() !== '');
        where.warehouse_id = { [Op.in]: warehouseIds };
      } else {
        where.warehouse_id = req.user.warehouse_id;
      }
    }
    await Expense.destroy({ where });
    res.json({ message: 'Đã xóa chi tiêu thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
