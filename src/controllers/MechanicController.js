const Mechanic = require('../models/Mechanic');

const MaintenanceOrder = require('../models/MaintenanceOrder');
const { Op } = require('sequelize');

exports.getAll = async (req, res) => {
  try {
    const mechanics = await Mechanic.findAll({
      order: [['mechanic_name', 'ASC']]
    });

    const activeOrders = await MaintenanceOrder.findAll({
      where: { status: { [Op.in]: ['PENDING', 'IN_PROGRESS'] } },
      attributes: ['mechanic_1_id', 'mechanic_2_id']
    });

    const busyIds = new Set();
    activeOrders.forEach(o => {
        if (o.mechanic_1_id) busyIds.add(o.mechanic_1_id);
        if (o.mechanic_2_id) busyIds.add(o.mechanic_2_id);
    });

    const result = mechanics.map(m => ({
        ...m.toJSON(),
        is_busy: busyIds.has(m.id)
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const mechanic = await Mechanic.create(req.body);
    res.status(201).json(mechanic);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    await Mechanic.update(req.body, { where: { id: req.params.id } });
    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await Mechanic.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Xóa thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
