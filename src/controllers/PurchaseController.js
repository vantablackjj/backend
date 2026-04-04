const Purchase = require('../models/Purchase');
const Vehicle = require('../models/Vehicle');
const PurchasePayment = require('../models/PurchasePayment');
const sequelize = require('../config/database');

exports.createPurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { supplier_id, warehouse_id, purchase_date, items, notes } = req.body;
    
    // XÁC ĐỊNH KHO THỰC TẾ (Chỉ Admin mới có quyền chọn kho khác)
    const activeWarehouseId = (req.user.role === 'ADMIN' && warehouse_id) ? warehouse_id : req.user.warehouse_id;


    // 1. Tính toán tổng tiền và Kiểm tra hợp lệ từng xe trước
    let totalVal = 0;
    for (const item of items) {
      if (!item.engine_no || !item.chassis_no || !item.type_id || !item.color_id || !item.price_vnd) {
          throw new Error(`Xe ${item.engine_no || 'chưa rõ Số máy'} đang thiếu thông tin quan trọng. Vui lòng kiểm tra lại tất cả các trường!`);
      }
      if (Number(item.price_vnd) <= 0) throw new Error('Giá nhập hàng của xe phải lớn hơn 0!');
      totalVal += Number(item.price_vnd);
    }

    // 2. Tạo hóa đơn Lô hàng (Header)
    const purchase = await Purchase.create({
      supplier_id,
      warehouse_id: activeWarehouseId,
      purchase_date,
      notes,
      total_amount_vnd: totalVal,
      paid_amount_vnd: 0,
      created_by: req.user.id
    }, { transaction });

    // 3. Ghi danh sách xe vào kho
    for (const item of items) {
      await Vehicle.create({
        engine_no: item.engine_no,
        chassis_no: item.chassis_no,
        type_id: item.type_id,
        color_id: item.color_id,
        purchase_id: purchase.id,
        warehouse_id: activeWarehouseId, 
        price_vnd: item.price_vnd, 
        status: 'In Stock',
        notes: item.notes // Ghi chú từng xe
      }, { transaction });
    }

    // 4. Tạo thông báo chi tiết
    const Supplier = require('../models/Supplier');
    const supplier = await Supplier.findByPk(supplier_id);
    const WarehouseModel = require('../models/Warehouse');
    const warehouse = await WarehouseModel.findByPk(activeWarehouseId);
    
    const { sendNotification } = require('../utils/notificationHelper');
    await sendNotification(req, {
        title: '🚚 Nhập hàng mới (Lô)',
        message: `Nhân viên ${req.user.full_name} đã nhập lô hàng ${items.length} xe tại [${warehouse?.warehouse_name || 'N/A'}] từ NCC: ${supplier?.name || 'N/A'}. Tổng tiền lô: ${Number(totalVal).toLocaleString()} đ.`,
        type: 'PURCHASE',
        warehouse_id: activeWarehouseId,
        link: `/report/purchases?warehouse_id=${activeWarehouseId}`
    });

    await transaction.commit();
    res.status(201).json({ message: 'Đã nhập đơn hàng thành công!', purchase });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: 'Lỗi: ' + error.message });
  }
};

exports.getBySupplier = (req, res) => {
  const { supplier_id, warehouse_id: queryWH } = req.query;
  
  let where = { supplier_id };
  if (req.user.role !== 'ADMIN') {
      where.warehouse_id = req.user.warehouse_id;
  } else if (queryWH) {
      where.warehouse_id = queryWH;
  }

  Purchase.findAll({ where, order: [['purchase_date', 'DESC']] })
    .then(list => res.json(list))
    .catch(err => res.status(500).json({ message: err.message }));
};


exports.getPurchaseDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicles = await Vehicle.findAll({ where: { purchase_id: id } });
    const payments = await PurchasePayment.findAll({ where: { purchase_id: id } });
    res.json({ vehicles, payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { purchase_id, amount_paid_vnd, payment_date, notes } = req.body;
    
    // XÁC THỰC QUYỀN TRẢ TIỀN (Chốt chặn)
    const purchase = await Purchase.findByPk(purchase_id, { transaction });
    if (!purchase) throw new Error('Không tìm thấy đơn hàng!');
    
    if (req.user.role !== 'ADMIN' && purchase.warehouse_id !== req.user.warehouse_id) {
        throw new Error('Bạn không có quyền thanh toán cho đơn hàng thuộc kho khác!');
    }

    const payment = await PurchasePayment.create({ purchase_id, amount_paid_vnd, payment_date, notes }, { transaction });
    purchase.paid_amount_vnd = Number(purchase.paid_amount_vnd || 0) + Number(amount_paid_vnd);
    await purchase.save({ transaction });

    await transaction.commit();
    res.status(201).json(payment);
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};

