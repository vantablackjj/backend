const Mechanic = require('../models/Mechanic');

exports.getAll = async (req, res) => {
  try {
    const mechanics = await Mechanic.findAll({
      order: [['mechanic_name', 'ASC']]
    });
    res.json(mechanics);
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
