const Vehicle = require('../models/Vehicle');
const VehicleType = require('../models/VehicleType');
const VehicleColor = require('../models/VehicleColor');

// Lấy toàn bộ danh sách xe đang có trong kho để bán
exports.getAvailable = async (req, res) => {
  try {
    let where = { status: 'In Stock', is_locked: false };

    
    // Nếu không phải ADMIN, chỉ thấy xe tại kho của mình
    // XÁC ĐỊNH BỘ LỌC KHO (Source of Truth)
    const queryWH = req.query.warehouse_id;
    if (req.user.role === 'ADMIN') {
        if (queryWH) where.warehouse_id = queryWH;
    } else {
        // NHÂN VIÊN: Ép buộc dùng kho của chính mình, không cho phép gửi warehouse_id qua query
        where.warehouse_id = req.user.warehouse_id;
    }


    const list = await Vehicle.findAll({
      where,
      order: [['engine_no', 'ASC']]
    });

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getByEngineNo = async (req, res) => {
    try {
        const { engine_no } = req.query;
        let where = { engine_no, status: 'In Stock', is_locked: false };


        if (req.user && req.user.role !== 'ADMIN' && req.user.warehouse_id) {
          where.warehouse_id = req.user.warehouse_id;
        }

        const vehicle = await Vehicle.findOne({ 
        where: { engine_no: engine_no, status: 'In Stock', is_locked: false, ...where }, 
    });

        if (!vehicle) return res.status(404).json({ message: 'Không tìm thấy xe trong kho' });
        res.json(vehicle);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
