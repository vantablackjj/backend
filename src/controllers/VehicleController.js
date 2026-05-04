const Vehicle = require('../models/Vehicle');
const VehicleType = require('../models/VehicleType');
const VehicleColor = require('../models/VehicleColor');
const Warehouse = require('../models/Warehouse');
const RetailSale = require('../models/RetailSale');
const { Op } = require('sequelize');

exports.getAll = async (req, res) => {
  try {
    const { status, warehouse_id, type_id, color_id, engine_no, chassis_no, search } = req.query;
    
    let where = {};
    
    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (type_id) where.type_id = type_id;
    if (color_id) where.color_id = color_id;
    
    if (search) {
      where[Op.or] = [
        { engine_no: { [Op.iLike]: `%${search}%` } },
        { chassis_no: { [Op.iLike]: `%${search}%` } }
      ];
    } else {
      if (engine_no) {
        where.engine_no = { [Op.iLike]: `%${engine_no}%` };
      }
      if (chassis_no) {
        where.chassis_no = { [Op.iLike]: `%${chassis_no}%` };
      }
    }

    // Role-based filtering: Non-admins only see vehicles in their warehouse by default
    // BUT allow them to see other warehouses if they specify warehouse_id in query
    if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
        if (!search && !engine_no && !chassis_no && !warehouse_id) {
            where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
        }
    }

    const vehicles = await Vehicle.findAll({
      where,
      include: [
        { model: VehicleType, attributes: ['name'] },
        { model: VehicleColor, attributes: ['color_name'] },
        { model: Warehouse, attributes: ['warehouse_name'] },
        { model: RetailSale, attributes: ['customer_name', 'phone', 'address'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, {
      include: [
        { model: VehicleType },
        { model: VehicleColor },
        { model: Warehouse },
        { model: RetailSale }
      ]
    });
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }
    
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const vehicle = await Vehicle.findByPk(id);
        if (!vehicle) return res.status(404).json({ message: 'Không tìm thấy xe' });

        // KIỂM TRA QUYỀN
        if (req.user.role !== 'ADMIN' && !req.user.allowedWarehouses.includes(vehicle.warehouse_id)) {
            return res.status(403).json({ message: 'Bạn không có quyền xóa xe của kho này' });
        }

        // Nếu xe đã bán hoặc đang khóa thì không cho xóa ngang xương
        if (vehicle.status !== 'In Stock') {
            return res.status(400).json({ message: 'Không thể xóa xe đã bán hoặc đang được chuyển kho. Hãy hủy đơn bán trước.' });
        }

        await vehicle.destroy();
        res.json({ message: 'Đã xóa xe thành công' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
