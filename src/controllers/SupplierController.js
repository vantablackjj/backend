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

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await Supplier.findByPk(id);
    if (!data) return res.status(404).json({ message: 'Không tìm thấy chủ hàng' });
    await data.update(req.body);
    res.json(data);
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
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ 
        message: 'Không thể xóa nhà cung cấp này vì đang có các lô hàng liên quan. Vui lòng kiểm tra lại!' 
      });
    }
    res.status(500).json({ message: error.message });
  }
};
