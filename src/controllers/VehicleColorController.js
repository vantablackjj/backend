const VehicleColor = require('../models/VehicleColor');

// Get all colors
exports.getAll = async (req, res) => {
  try {
    const colors = await VehicleColor.findAll({ order: [['createdAt', 'DESC']] });
    res.json(colors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a color
exports.create = async (req, res) => {
  try {
    const { color_name } = req.body;
    const newColor = await VehicleColor.create({ color_name });
    res.status(201).json(newColor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a color
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await VehicleColor.destroy({ where: { id } });
    res.json({ message: 'Đã xóa màu xe thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
