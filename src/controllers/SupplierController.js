const Supplier = require('../models/Supplier');

exports.getAll = async (req, res) => {
  try {
    const list = await Supplier.findAll({ order: [['createdAt', 'DESC']] });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await Supplier.create(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await Supplier.destroy({ where: { id } });
    res.json({ message: 'Đã xóa chủ hàng thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
