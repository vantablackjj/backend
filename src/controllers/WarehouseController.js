const Warehouse = require('../models/Warehouse');

exports.getAll = async (req, res) => {
  try {
    const warehouses = await Warehouse.findAll();
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json(warehouse);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await Warehouse.update(req.body, {
      where: { id: id }
    });
    if (updated) {
      const updatedWarehouse = await Warehouse.findByPk(id);
      return res.status(200).json(updatedWarehouse);
    }
    throw new Error('Warehouse not found');
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Warehouse.destroy({
      where: { id: id }
    });
    if (deleted) {
      return res.status(204).send("Warehouse deleted");
    }
    throw new Error('Warehouse not found');
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
