const MaintenanceRule = require('../models/MaintenanceRule');

const getAll = async (req, res) => {
  try {
    const rules = await MaintenanceRule.findAll({
      order: [['min_km', 'ASC']]
    });
    res.json(rules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const create = async (req, res) => {
  try {
    const rule = await MaintenanceRule.create(req.body);
    res.status(201).json(rule);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    await MaintenanceRule.update(req.body, { where: { id } });
    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteRule = async (req, res) => {
  try {
    const { id } = req.params;
    await MaintenanceRule.destroy({ where: { id } });
    res.json({ message: 'Xóa thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getAll,
  create,
  update,
  deleteRule
};
