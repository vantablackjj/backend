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

// Update a color
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const color = await VehicleColor.findByPk(id);
    if (!color) return res.status(404).json({ message: 'Không tìm thấy màu xe' });
    await color.update(req.body);
    res.json(color);
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
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ 
        message: 'Không thể xóa màu này vì đang có xe trong kho sử dụng màu này. Vui lòng kiểm tra lại!' 
      });
    }
    res.status(500).json({ message: error.message });
  }
};
