const LiftTable = require('../models/LiftTable');
const Warehouse = require('../models/Warehouse');
const MaintenanceOrder = require('../models/MaintenanceOrder');
const { Op } = require('sequelize');

const getLiftTables = async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    const where = {};
    if (warehouse_id) where.warehouse_id = warehouse_id;

    const liftTables = await LiftTable.findAll({
      where,
      include: [
        { model: Warehouse, attributes: ['warehouse_name'] },
        {
          model: MaintenanceOrder,
          where: { status: { [Op.in]: ['PENDING', 'IN_PROGRESS'] } },
          required: false,
          attributes: ['id', 'status', 'license_plate', 'customer_name']
        }
      ],
      order: [['name', 'ASC']]
    });
    res.json(liftTables);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createLiftTable = async (req, res) => {
  try {
    const { name, warehouse_id } = req.body;
    const liftTable = await LiftTable.create({ name, warehouse_id });
    res.status(201).json(liftTable);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateLiftTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, warehouse_id } = req.body;
    await LiftTable.update({ name, status, warehouse_id }, { where: { id } });
    res.json({ message: 'Cập nhật bàn nâng thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteLiftTable = async (req, res) => {
  try {
    const { id } = req.params;
    await LiftTable.destroy({ where: { id } });
    res.json({ message: 'Xóa bàn nâng thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getLiftTables,
  createLiftTable,
  updateLiftTable,
  deleteLiftTable
};
