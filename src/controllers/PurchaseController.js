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

exports.deleteLot = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { force } = req.body; 

    const purchase = await Purchase.findByPk(id, { transaction });
    if (!purchase) throw new Error('Không tìm thấy lô hàng cần xóa!');

    // KIỂM TRA QUYỀN XÓA
    if (req.user.role !== 'ADMIN' && purchase.warehouse_id !== req.user.warehouse_id) {
        throw new Error('Bạn không có quyền xóa lô hàng của kho khác!');
    }

    // 1. Tìm tất cả xe trong lô và kiểm tra các giao dịch liên quan
    const vehicles = await Vehicle.findAll({ where: { purchase_id: id }, transaction });
    const vehicleIds = vehicles.map(v => v.id);
    const soldVehicles = vehicles.filter(v => v.status === 'Sold');

    const TransferItem = require('../models/TransferItem');
    const transferItems = await TransferItem.findAll({ where: { vehicle_id: vehicleIds }, transaction });

    // 2. Nếu có giao dịch (bán hoặc chuyển kho) mà chưa xác nhận force delete
    if ((soldVehicles.length > 0 || transferItems.length > 0) && !force) {
        const reasons = [];
        if (soldVehicles.length > 0) reasons.push(`${soldVehicles.length} xe đã bán`);
        if (transferItems.length > 0) reasons.push(`${transferItems.length} lượt chuyển kho`);

        await transaction.rollback();
        return res.status(409).json({
            message: `Lô này có ${reasons.join(' và ')}. Nếu xóa, hệ thống sẽ XÓA LUÔN các đơn bán và phiếu chuyển kho liên quan để anh nhập lại. Anh chắc chắn chứ?`,
            has_sold: soldVehicles.length > 0,
            has_transfers: transferItems.length > 0
        });
    }

    // 3. XÓA CÁC ĐƠN BÁN LIÊN QUAN (NẾU CÓ)
    for (const v of soldVehicles) {
        if (v.retail_sale_id) {
            const RetailSale = require('../models/RetailSale');
            const RetailPayment = require('../models/RetailPayment');
            await RetailPayment.destroy({ where: { retail_sale_id: v.retail_sale_id }, transaction });
            await RetailSale.destroy({ where: { id: v.retail_sale_id }, transaction });
        }
        if (v.wholesale_sale_id) {
            const WholesaleSale = require('../models/WholesaleSale');
            const WholesalePayment = require('../models/WholesalePayment');
            
            // Tìm tất cả xe CÙNG LÔ BÁN BUÔN NÀY để reset (vì đơn bán biến mất)
            await Vehicle.update(
                { status: 'In Stock', wholesale_sale_id: null },
                { where: { wholesale_sale_id: v.wholesale_sale_id }, transaction }
            );

            await WholesalePayment.destroy({ where: { wholesale_sale_id: v.wholesale_sale_id }, transaction });
            await WholesaleSale.destroy({ where: { id: v.wholesale_sale_id }, transaction });
        }
    }

    // 4. XÓA CÁC PHIẾU CHUYỂN KHO LIÊN QUAN (NẾU CÓ)
    if (transferItems.length > 0) {
        const transferIds = [...new Set(transferItems.map(ti => ti.transfer_id))];
        const Transfer = require('../models/Transfer');
        const TransferPayment = require('../models/TransferPayment');
        const TransferLog = require('../models/TransferLog');

        for (const tId of transferIds) {
            const transfer = await Transfer.findByPk(tId, { transaction });
            if (transfer) {
                // Tìm tất cả xe cùng phiếu chuyển này để khôi phục về kho gốc
                const allItemsInTransfer = await TransferItem.findAll({ where: { transfer_id: tId }, transaction });
                for (const item of allItemsInTransfer) {
                    // Nếu xe KHÔNG thuộc lô đang xóa, thì trả nó về kho cũ và mở khóa
                    if (!vehicleIds.includes(item.vehicle_id)) {
                        await Vehicle.update(
                            { warehouse_id: transfer.from_warehouse_id, is_locked: false },
                            { where: { id: item.vehicle_id }, transaction }
                        );
                    }
                }
                
                await TransferPayment.destroy({ where: { transfer_id: tId }, transaction });
                await TransferLog.destroy({ where: { transfer_id: tId }, transaction });
                await TransferItem.destroy({ where: { transfer_id: tId }, transaction });
                await transfer.destroy({ transaction });
            }
        }
    }

    // 5. Xóa các xe trong lô nhập
    await Vehicle.destroy({ where: { purchase_id: id }, transaction });

    // 6. Xóa lịch sử trả tiền cho lô nhập
    await PurchasePayment.destroy({ where: { purchase_id: id }, transaction });

    // 7. Xóa lô nhập hàng
    await purchase.destroy({ transaction });

    await transaction.commit();
    res.json({ message: 'Đã xóa toàn bộ lô hàng và tất cả giao dịch liên quan thành công!' });

  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ message: 'Lỗi hệ thống khi xóa: ' + error.message });
  }
};

exports.deleteVehicleFromPurchase = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { purchase_id, vehicle_id } = req.params;
        const { force } = req.body;

        const purchase = await Purchase.findByPk(purchase_id, { transaction });
        if (!purchase) throw new Error('Không tìm thấy lô hàng!');

        const vehicle = await Vehicle.findOne({ where: { id: vehicle_id, purchase_id }, transaction });
        if (!vehicle) throw new Error('Không tìm thấy xe trong lô này!');

        // 1. Kiểm tra quyền xóa
        if (req.user.role !== 'ADMIN' && purchase.warehouse_id !== req.user.warehouse_id) {
            throw new Error('Bạn không có quyền xóa xe của kho khác!');
        }

        // 2. Kiểm tra nếu xe đã giao dịch (Bán hoặc Chuyển kho)
        if (vehicle.status === 'Sold' && !force) {
            await transaction.rollback();
            return res.status(409).json({
                message: `Xe này đã bán. Nếu xóa, hệ thống sẽ XÓA LUÔN đơn bán liên quan. Bạn chắc chắn chứ?`,
                has_sold: true
            });
        }

        // 3. Xóa đơn bán liên quan nếu force delete xe đã bán
        if (vehicle.status === 'Sold' && force) {
            if (vehicle.retail_sale_id) {
                const RetailSale = require('../models/RetailSale');
                const RetailPayment = require('../models/RetailPayment');
                await RetailPayment.destroy({ where: { retail_sale_id: vehicle.retail_sale_id }, transaction });
                await RetailSale.destroy({ where: { id: vehicle.retail_sale_id }, transaction });
            }
            if (vehicle.wholesale_sale_id) {
                const WholesaleSale = require('../models/WholesaleSale');
                const WholesalePayment = require('../models/WholesalePayment');
                await WholesalePayment.destroy({ where: { wholesale_sale_id: vehicle.wholesale_sale_id }, transaction });
                await WholesaleSale.destroy({ where: { id: vehicle.wholesale_sale_id }, transaction });
            }
        }

        // 4. Xóa xe
        const vehiclePrice = Number(vehicle.price_vnd || 0);
        await vehicle.destroy({ transaction });

        // 5. Cập nhật lại tổng tiền lô hàng
        purchase.total_amount_vnd = Math.max(0, Number(purchase.total_amount_vnd || 0) - vehiclePrice);
        await purchase.save({ transaction });

        // 6. Kiểm tra nếu lô không còn xe nào thì có thể xóa luôn lô (Tùy chọn, nhưng thường nên để lại)
        // const remainingVehicles = await Vehicle.count({ where: { purchase_id }, transaction });
        // if (remainingVehicles === 0) { ... }

        await transaction.commit();
        res.json({ message: 'Đã xóa xe khỏi lô hàng thành công!' });
    } catch (error) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ message: error.message });
    }
};

exports.deletePayment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const PurchasePayment = require('../models/PurchasePayment');
        const payment = await PurchasePayment.findByPk(id, { transaction });
        if (!payment) throw new Error('Không tìm thấy khoản thanh toán!');

        const purchase = await Purchase.findByPk(payment.purchase_id, { transaction });
        if (!purchase) throw new Error('Không tìm thấy lô hàng liên quan!');

        if (req.user.role !== 'ADMIN' && purchase.warehouse_id !== req.user.warehouse_id) {
            throw new Error('Bạn không có quyền xóa thanh toán của kho khác!');
        }

        // 1. Trừ tiền đã thanh toán của lô
        purchase.paid_amount_vnd = Math.max(0, Number(purchase.paid_amount_vnd || 0) - Number(payment.amount_paid_vnd));
        await purchase.save({ transaction });

        // 2. Xóa khoản thanh toán
        await payment.destroy({ transaction });

        await transaction.commit();
        res.json({ message: 'Đã xóa khoản thanh toán thành công!' });
    } catch (error) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ message: error.message });
    }
}
