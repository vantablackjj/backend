const { Op } = require("sequelize");
const WholesaleSale = require("../models/WholesaleSale");
const WholesalePayment = require("../models/WholesalePayment");
const Vehicle = require("../models/Vehicle");
const VehicleType = require("../models/VehicleType");
const VehicleColor = require("../models/VehicleColor");
const sequelize = require("../config/database");

exports.createSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      customer_id,
      sale_date,
      items,
      notes,
      warehouse_id: bodyWH,
    } = req.body;

    // XÁC ĐỊNH KHO THỰC TẾ (Source of Truth)
    const activeWarehouseId = bodyWH || req.user.warehouse_id;
    if (!req.user.allowedWarehouses.includes(activeWarehouseId)) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền thực hiện tại kho này" });
    }

    // KIỂM TRA TRÙNG LẶP XE TRONG DANH SÁCH
    const vehicleIds = items.map((item) => item.vehicle_id || item.id);
    if (new Set(vehicleIds).size !== vehicleIds.length) {
      throw new Error(
        "Lỗi: Danh sách xe trong lô hàng bị trùng lặp số máy/số khung!",
      );
    }

    // 1. Tạo hóa đơn bán buôn (Lưu kèm warehouse_id)
    const sale = await WholesaleSale.create(
      {
        customer_id,
        sale_date,
        notes,
        warehouse_id: activeWarehouseId,
        total_amount_vnd: items.reduce(
          (sum, item) => sum + (Number(item.price_vnd) || 0),
          0,
        ),
        created_by: req.user.id,
      },
      { transaction },
    );

    // 2. Cập nhật trạng thái từng xe và kiểm tra kho
    for (const item of items) {
      // KIỂM TRA GIÁ TẠI BACKEND (Cho phép 0đ cho trường hợp xe mượn/trả lại)
      if (
        item.price_vnd === undefined ||
        item.price_vnd === null ||
        Number(item.price_vnd) < 0
      ) {
        throw new Error(
          "Tất cả các xe trong lô hàng bán buôn đều phải có Giá bán hợp lệ (>= 0)!",
        );
      }

      const vehicleId = item.vehicle_id || item.id;

      const vehicle = await Vehicle.findOne({
        where: {
          id: vehicleId,
          warehouse_id: activeWarehouseId,
          status: "In Stock",
          is_locked: false, // CHỈ LẤY XE KHÔNG BỊ KHÓA
        },
        transaction,
        lock: transaction.LOCK.UPDATE, // NGĂN CHẶN RĂNG CƯA KHI BÁN CÙNG LÚC
      });

      if (!vehicle)
        throw new Error(
          `Xe ${item.engine_no || vehicleId} không tồn tại, đã bán hoặc ĐANG BỊ KHÓA (đang chuyển kho)!`,
        );

      vehicle.status = "Sold";
      vehicle.wholesale_sale_id = sale.id;
      vehicle.wholesale_price_vnd = Number(item.price_vnd); // LƯU GIÁ BÁN TỪNG XE
      vehicle.notes = item.notes; // Ghi chú bán hàng
      await vehicle.save({ transaction });
    }

    // 3. Tạo thông báo chi tiết
    const WholesaleCustomer = require("../models/WholesaleCustomer");
    const customer = await WholesaleCustomer.findByPk(customer_id);
    const WarehouseModel = require("../models/Warehouse");
    const warehouse = await WarehouseModel.findByPk(activeWarehouseId);

    const { sendNotification } = require("../utils/notificationHelper");
    await sendNotification(req, {
      title: "📦 Bán buôn lô mới",
      message: `Nhân viên ${req.user.full_name} đã bán lô xe ${items.length} chiếc tại [${warehouse?.warehouse_name || "N/A"}] cho khách sỉ: ${customer?.name || "N/A"}. Tổng tiền: ${Number(sale.total_amount_vnd).toLocaleString()} đ.`,
      type: "WHOLESALE_SALE",
      warehouse_id: activeWarehouseId,
      link: `/report/sales-wholesale?warehouse_id=${activeWarehouseId}`,
    });

    await transaction.commit();
    res.status(201).json({ message: "Đã tạo đơn bán buôn thành công!", sale });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};

exports.getByCustomer = async (req, res) => {
  try {
    const { customer_id, warehouse_id: queryWH } = req.query;
    if (!customer_id)
      return res.status(400).json({ message: "Thiếu mã khách hàng" });

    let where = { customer_id };
    const isPowerUser =
      req.user.role === "ADMIN" || req.user.role === "MANAGER";

    if (isPowerUser) {
      if (queryWH) where.warehouse_id = queryWH;
    } else {
      where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }

    const sales = await WholesaleSale.findAll({
      where,
      include: [
        { model: require("../models/WholesaleCustomer") },
        { model: require("../models/Warehouse") },
      ],
      order: [
        ["sale_date", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format to prevent 500 error from DB
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res
        .status(400)
        .json({ message: "Mã hóa đơn không hợp lệ (Phải là UUID)" });
    }

    const vehicles = await Vehicle.findAll({
      where: { wholesale_sale_id: id },
      include: [
        { model: VehicleType, attributes: ["name"] },
        { model: VehicleColor, attributes: ["color_name"] },
      ],
    });
    const payments = await WholesalePayment.findAll({
      where: { wholesale_sale_id: id },
    });
    res.json({ vehicles, payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { wholesale_sale_id, amount_paid_vnd, payment_date, notes } =
      req.body;

    // XÁC THỰC QUYỀN THU NỢ (Chốt chặn)
    const sale = await WholesaleSale.findByPk(wholesale_sale_id, {
      transaction,
    });
    if (!sale) throw new Error("Không tìm thấy đơn bán buôn!");

    if (
      req.user.role !== "ADMIN" &&
      !req.user.allowedWarehouses.includes(sale.warehouse_id)
    ) {
      throw new Error("Bạn không có quyền thu nợ cho đơn hàng thuộc kho này!");
    }

    const payment = await WholesalePayment.create(
      {
        wholesale_sale_id,
        amount_paid_vnd,
        payment_date,
        notes,
      },
      { transaction },
    );

    sale.paid_amount_vnd =
      Number(sale.paid_amount_vnd || 0) + Number(amount_paid_vnd);
    await sale.save({ transaction });

    await transaction.commit();
    res.status(201).json(payment);
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};

exports.deleteSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;

    const sale = await WholesaleSale.findByPk(id, { transaction });
    if (!sale) throw new Error("Không tìm thấy đơn bán buôn!");

    if (
      req.user.role !== "ADMIN" &&
      !req.user.allowedWarehouses.includes(sale.warehouse_id)
    ) {
      throw new Error("Bạn không có quyền xóa đơn hàng của kho này!");
    }

    // 1. Reset trạng thái xe về 'In Stock'
    await Vehicle.update(
      { status: "In Stock", wholesale_sale_id: null },
      { where: { wholesale_sale_id: id }, transaction },
    );

    // 2. Xóa các khoản thanh toán của đơn này
    await WholesalePayment.destroy({
      where: { wholesale_sale_id: id },
      transaction,
    });

    // 3. Xóa đơn bán buôn
    await sale.destroy({ transaction });

    await transaction.commit();
    res.json({ message: "Đã xóa toàn bộ đơn bán buôn thành công!" });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

exports.deleteVehicleFromSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { sale_id, vehicle_id } = req.params;
    const { deduct_amount } = req.body;

    const sale = await WholesaleSale.findByPk(sale_id, { transaction });
    if (!sale) throw new Error("Không tìm thấy đơn bán buôn!");

    const vehicle = await Vehicle.findOne({
      where: { id: vehicle_id, wholesale_sale_id: sale_id },
      transaction,
    });
    if (!vehicle) throw new Error("Không tìm thấy xe trong đơn này!");

    // 1. Quyền xóa
    if (
      req.user.role !== "ADMIN" &&
      !req.user.allowedWarehouses.includes(sale.warehouse_id)
    ) {
      throw new Error("Bạn không có quyền xóa xe của kho này!");
    }

    // 2. Reset trạng thái xe
    vehicle.status = "In Stock";
    vehicle.wholesale_sale_id = null;
    await vehicle.save({ transaction });

    // 3. Tự động trừ tiền: Ưu tiên dùng wholesale_price_vnd có sẵn của xe
    const finalDeductAmount =
      deduct_amount !== undefined
        ? Number(deduct_amount)
        : Number(vehicle.wholesale_price_vnd || 0);

    if (finalDeductAmount > 0) {
      sale.total_amount_vnd = Math.max(
        0,
        Number(sale.total_amount_vnd || 0) - finalDeductAmount,
      );
      await sale.save({ transaction });
    }

    await transaction.commit();
    res.json({ message: "Đã xóa xe khỏi lô bán buôn thành công!" });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

exports.deletePayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const payment = await WholesalePayment.findByPk(id, { transaction });
    if (!payment) throw new Error("Không tìm thấy khoản thanh toán!");

    const sale = await WholesaleSale.findByPk(payment.wholesale_sale_id, {
      transaction,
    });
    if (!sale) throw new Error("Không tìm thấy đơn bán buôn liên quan!");

    if (
      req.user.role !== "ADMIN" &&
      !req.user.allowedWarehouses.includes(sale.warehouse_id)
    ) {
      throw new Error("Bạn không có quyền xóa thanh toán của kho này!");
    }

    // 1. Trừ tiền đã trả của đơn bán buôn
    sale.paid_amount_vnd = Math.max(
      0,
      Number(sale.paid_amount_vnd || 0) - Number(payment.amount_paid_vnd),
    );
    await sale.save({ transaction });

    // 2. Xóa khoản thanh toán
    await payment.destroy({ transaction });

    await transaction.commit();
    res.json({ message: "Đã xóa khoản thanh toán thành công!" });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ message: error.message });
  }
};

exports.payAllSales = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { customer_id, amount_paid_vnd, payment_date, notes } = req.body;
    let remainingAmount = Number(amount_paid_vnd);

    if (remainingAmount <= 0) throw new Error("Số tiền thu phải lớn hơn 0");

    let where = { customer_id };
    if (req.user.role !== "ADMIN") {
      where.warehouse_id = { [Op.in]: req.user.allowedWarehouses };
    }
    where[Op.and] = sequelize.where(
      sequelize.col("total_amount_vnd"),
      ">",
      sequelize.col("paid_amount_vnd"),
    );

    const unpaidSales = await WholesaleSale.findAll({
      where,
      order: [
        ["sale_date", "ASC"],
        ["createdAt", "ASC"],
      ],
      transaction,
    });

    if (unpaidSales.length === 0)
      throw new Error(
        "Không có nợ cần thu cho khách hàng này trong phạm vi kho được phép!",
      );

    const payments = [];

    for (const sale of unpaidSales) {
      if (remainingAmount <= 0) break;

      const debt = Number(sale.total_amount_vnd) - Number(sale.paid_amount_vnd);
      const paymentForThisLot = Math.min(debt, remainingAmount);

      const payment = await WholesalePayment.create(
        {
          wholesale_sale_id: sale.id,
          amount_paid_vnd: paymentForThisLot,
          payment_date,
          notes: notes ? `${notes} (Thu nợ gộp đơn)` : "Thu nợ gộp đơn",
        },
        { transaction },
      );

      sale.paid_amount_vnd = Number(sale.paid_amount_vnd) + paymentForThisLot;
      await sale.save({ transaction });

      remainingAmount -= paymentForThisLot;
      payments.push(payment);
    }

    await transaction.commit();
    res.status(201).json({
      message: `Đã thu nợ gộp cho ${payments.length} đơn hàng. Còn thừa: ${remainingAmount.toLocaleString()} đ`,
      payments,
      remaining_unused: remainingAmount,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};
