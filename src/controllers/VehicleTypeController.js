const VehicleType = require('../models/VehicleType');

exports.getAll = async (req, res) => {
  try {
    const list = await VehicleType.findAll({ order: [['createdAt', 'DESC']] });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await VehicleType.create(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await VehicleType.destroy({ where: { id } });
    res.json({ message: 'Đã xóa loại xe thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
