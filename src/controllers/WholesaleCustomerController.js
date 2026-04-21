const WholesaleCustomer = require('../models/WholesaleCustomer');
const { Op } = require('sequelize');

exports.getAll = async (req, res) => {
  try {
    const { type } = req.query;
    const where = {};
    if (type) {
      if (type === 'PART') {
        where.customer_type = { [Op.in]: ['PART', 'BOTH'] };
      } else if (type === 'VEHICLE') {
        where.customer_type = { [Op.in]: ['VEHICLE', 'BOTH'] };
      }
    }
    const list = await WholesaleCustomer.findAll({ 
      where,
      order: [['createdAt', 'DESC']] 
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const data = await WholesaleCustomer.create(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await WholesaleCustomer.findByPk(id);
    if (!data) return res.status(404).json({ message: 'Không tìm thấy khách buôn' });
    await data.update(req.body);
    res.json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await WholesaleCustomer.destroy({ where: { id } });
    res.json({ message: 'Đã xóa khách buôn thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
