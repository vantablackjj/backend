const WholesaleSale = require('../models/WholesaleSale');
const WholesalePayment = require('../models/WholesalePayment');
const Vehicle = require('../models/Vehicle');
const sequelize = require('../config/database');

exports.createSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { customer_id, sale_date, items, notes, warehouse_id: bodyWH } = req.body;

    // XÁC ĐỊNH KHO THỰC TẾ (Source of Truth)
    const activeWarehouseId = (req.user.role === 'ADMIN' && bodyWH) ? bodyWH : req.user.warehouse_id;

    // KIỂM TRA TRÙNG LẶP XE TRONG DANH SÁCH
    const vehicleIds = items.map(item => item.vehicle_id || item.id);
    if (new Set(vehicleIds).size !== vehicleIds.length) {
        throw new Error('Lỗi: Danh sách xe trong lô hàng bị trùng lặp số máy/số khung!');
    }

    // 1. Tạo hóa đơn bán buôn (Lưu kèm warehouse_id)
    const sale = await WholesaleSale.create({
      customer_id,
      sale_date,
      notes,
      warehouse_id: activeWarehouseId,
      total_amount_vnd: items.reduce((sum, item) => sum + (Number(item.price_vnd) || 0), 0),
      created_by: req.user.id
    }, { transaction });

    // 2. Cập nhật trạng thái từng xe và kiểm tra kho
    for (const item of items) {
      // KIỂM TRA GIÁ TẠI BACKEND
      if (!item.price_vnd || Number(item.price_vnd) <= 0) {
          throw new Error('Tất cả các xe trong lô hàng bán buôn đều phải có Giá bán lớn hơn 0!');
      }

      const vehicleId = item.vehicle_id || item.id;

      const vehicle = await Vehicle.findOne({ 
        where: { 
          id: vehicleId, 
          warehouse_id: activeWarehouseId, 
          status: 'In Stock',
          is_locked: false // CHỈ LẤY XE KHÔNG BỊ KHÓA
        }, 
        transaction 
      });

      if (!vehicle) throw new Error(`Xe ${item.engine_no || vehicleId} không tồn tại, đã bán hoặc ĐANG BỊ KHÓA (đang chuyển kho)!`);

      
      vehicle.status = 'Sold';
      vehicle.wholesale_sale_id = sale.id;
      vehicle.notes = item.notes; // Ghi chú bán hàng
      await vehicle.save({ transaction });
    }

    // 3. Tạo thông báo chi tiết
    const WholesaleCustomer = require('../models/WholesaleCustomer');
    const customer = await WholesaleCustomer.findByPk(customer_id);
    const WarehouseModel = require('../models/Warehouse');
    const warehouse = await WarehouseModel.findByPk(activeWarehouseId);
    
    const { sendNotification } = require('../utils/notificationHelper');
    await sendNotification(req, {
        title: '📦 Bán buôn lô mới',
        message: `Nhân viên ${req.user.full_name} đã bán lô xe ${items.length} chiếc tại [${warehouse?.warehouse_name || 'N/A'}] cho khách sỉ: ${customer?.name || 'N/A'}. Tổng tiền: ${Number(sale.total_amount_vnd).toLocaleString()} đ.`,
        type: 'WHOLESALE_SALE',
        warehouse_id: activeWarehouseId,
        link: `/report/sales-wholesale?warehouse_id=${activeWarehouseId}`
    });

    await transaction.commit();
    res.status(201).json({ message: 'Đã tạo đơn bán buôn thành công!', sale });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};


exports.getByCustomer = async (req, res) => {
  try {
    const { customer_id, warehouse_id: queryWH } = req.query;
    if (!customer_id) return res.status(400).json({ message: 'Thiếu mã khách hàng' });

    let where = { customer_id };
    if (req.user.role !== 'ADMIN') {
        where.warehouse_id = req.user.warehouse_id;
    } else if (queryWH) {
        where.warehouse_id = queryWH;
    }

    const sales = await WholesaleSale.findAll({
      where,
      order: [['sale_date', 'DESC']]
    });

    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicles = await Vehicle.findAll({ where: { wholesale_sale_id: id } });
    const payments = await WholesalePayment.findAll({ where: { wholesale_sale_id: id } });
    res.json({ vehicles, payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { wholesale_sale_id, amount_paid_vnd, payment_date, notes } = req.body;

    // XÁC THỰC QUYỀN THU NỢ (Chốt chặn)
    const sale = await WholesaleSale.findByPk(wholesale_sale_id, { transaction });
    if (!sale) throw new Error('Không tìm thấy đơn bán buôn!');

    if (req.user.role !== 'ADMIN' && sale.warehouse_id !== req.user.warehouse_id) {
        throw new Error('Bạn không có quyền thu nợ cho đơn hàng thuộc kho khác!');
    }

    const payment = await WholesalePayment.create({
      wholesale_sale_id,
      amount_paid_vnd,
      payment_date,
      notes
    }, { transaction });

    sale.paid_amount_vnd = Number(sale.paid_amount_vnd || 0) + Number(amount_paid_vnd);
    await sale.save({ transaction });

    await transaction.commit();
    res.status(201).json(payment);
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};

