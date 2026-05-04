const { Op } = require("sequelize");
const Vehicle = require("../models/Vehicle");
const VehicleType = require("../models/VehicleType");
const VehicleColor = require("../models/VehicleColor");

// Lấy toàn bộ danh sách xe đang có trong kho để bán
exports.getAvailable = async (req, res) => {
  try {
    let where = { status: "In Stock", is_locked: false };

    // Nếu là quan sát tồn kho để xin chuyển, cho phép xem kho khác
    const queryWH = req.query.warehouse_id;
    if (queryWH) {
        where.warehouse_id = queryWH;
    } else if (req.user.role !== "ADMIN") {
        where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }

    const list = await Vehicle.findAll({
      where,
      include: [
        { model: VehicleType, attributes: ["name", "type", "suggested_price"] },
        { model: VehicleColor, attributes: ["color_name"] },
      ],
      order: [["engine_no", "ASC"]],
    });

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getByEngineNo = async (req, res) => {
  try {
    const { engine_no } = req.query;
    let where = { engine_no, status: "In Stock", is_locked: false };

    if (req.user && req.user.role !== "ADMIN" && req.user.role !== "MANAGER") {
      where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }

    const vehicle = await Vehicle.findOne({
      where: {
        engine_no: engine_no,
        status: "In Stock",
        is_locked: false,
        ...where,
      },
    });

    if (!vehicle)
      return res.status(404).json({ message: "Không tìm thấy xe trong kho" });
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
