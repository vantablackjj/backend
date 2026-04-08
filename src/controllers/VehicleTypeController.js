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
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ 
        message: 'Không thể xóa loại xe này vì đang có xe trong kho thuộc loại này. Vui lòng kiểm tra lại!' 
      });
    }
    res.status(500).json({ message: error.message });
  }
};
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await VehicleType.findByPk(id);
    if (!type) {
      return res.status(404).json({ message: 'Danh mục loại xe không tồn tại' });
    }
    await type.update(req.body);
    res.json(type);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
