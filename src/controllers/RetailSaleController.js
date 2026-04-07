const RetailSale = require('../models/RetailSale');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const VehicleType = require('../models/VehicleType');
const VehicleColor = require('../models/VehicleColor');
const sequelize = require('../config/database');

exports.create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { 
      vehicle_id, customer_name, sale_price, paid_amount, 
      sale_date, notes, address, id_card, phone, gender, 
      sale_type, guarantee, guarantor_name, guarantor_phone,
      seller_id,
      warehouse_id: bodyWH,
      payment_method, bank_name, contract_number, loan_amount
    } = req.body;

    // XÁC ĐỊNH NGƯỜI BÁN THỰC TẾ (Source of Truth)
    const actualSellerId = (req.user.role === 'ADMIN' && seller_id) ? seller_id : req.user.id;


    // KIỂM TRA GIÁ BÁN TẠI BACKEND
    if (!sale_price || Number(sale_price) <= 0) {
        throw new Error('Giá bán thực tế của xe phải lớn hơn 0!');
    }


    // XÁC ĐỊNH KHO THỰC TẾ (Source of Truth)
    const activeWarehouseId = (req.user.role === 'ADMIN' && bodyWH) ? bodyWH : req.user.warehouse_id;

    // 1. Kiểm tra xe phải có trong kho và THUỘC ĐÚNG KHO ĐANG LÀM VIỆC
    const vehicle = await Vehicle.findOne({ 
        where: { id: vehicle_id, warehouse_id: activeWarehouseId, status: 'In Stock', is_locked: false }, 
        transaction 
    });
    
    if (!vehicle) throw new Error('Xe này không tồn tại, đã bán, hoặc ĐANG BỊ KHÓA (đang chuyển kho)!');


    // 2. Tạo hóa đơn bán lẻ (Lưu kèm warehouse_id để báo cáo)
    const sale = await RetailSale.create({
      engine_no: vehicle.engine_no,
      chassis_no: vehicle.chassis_no,
      customer_name,
      total_price: sale_price,
      paid_amount: (paid_amount !== undefined) ? paid_amount : sale_price,
      sale_date,
      notes,
      address,
      id_card,
      phone,
      gender,
      sale_type,
      guarantee,
      guarantor_name,
      guarantor_phone,
      seller_id: actualSellerId,

      warehouse_id: activeWarehouseId, // Quan trọng: Truy vết kho bán
      payment_method,
      bank_name,
      contract_number,
      loan_amount,
      created_by: req.user.id
    }, { transaction });

    // 3. Cập nhật trạng thái xe và mã bán lẻ
    vehicle.status = 'Sold';
    vehicle.retail_sale_id = sale.id;
    await vehicle.save({ transaction });

    // 4. Tạo thông báo chi tiết cho hệ thống
    const WarehouseModel = require('../models/Warehouse');
    const warehouse = await WarehouseModel.findByPk(activeWarehouseId);
    
    const { sendNotification } = require('../utils/notificationHelper');
    await sendNotification(req, {
        title: '💎 Bán lẻ xe mới',
        message: `Nhân viên ${req.user.full_name} đã bán lẻ xe ${vehicle.engine_no} tại [${warehouse?.warehouse_name || 'N/A'}] cho khách hàng: ${customer_name}. Số tiền: ${Number(sale_price).toLocaleString()} đ.`,
        type: 'RETAIL_SALE',
        warehouse_id: activeWarehouseId,
        link: `/report/sales-retail?warehouse_id=${activeWarehouseId}`
    });

    await transaction.commit();
    res.status(201).json({ message: 'Bán xe lẻ thành công!', sale });
  } catch (error) {
    await transaction.rollback();
    res.status(400).json({ message: error.message });
  }
};


exports.getAll = async (req, res) => {
  try {
    let where = {};
    if (req.user.role !== 'ADMIN') {
        where.warehouse_id = req.user.warehouse_id;
    }
    
    const list = await RetailSale.findAll({ 
      where,
      order: [['sale_date', 'DESC']],
      attributes: { include: [['total_price', 'sale_price']] },
      include: [
        { model: User, as: 'seller', attributes: ['full_name', 'phone'] },
        { model: Warehouse },
        { 
          model: Vehicle, 
          include: [
            { model: VehicleType, attributes: ['name'] },
            { model: VehicleColor, attributes: ['color_name'] }
          ] 
        }
      ]
    });
    res.json(list);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const sale = await RetailSale.findByPk(id);
        if (!sale) return res.status(404).json({ message: 'Không tìm thấy đơn bán' });

        // KIỂM TRA QUYỀN XÓA
        if (req.user.role !== 'ADMIN' && sale.warehouse_id !== req.user.warehouse_id) {
            throw new Error('Bạn không có quyền xóa đơn bán của kho khác!');
        }

        // Khôi phục trạng thái xe về In Stock
        const vehicle = await Vehicle.findOne({ where: { retail_sale_id: sale.id }, transaction });
        if (vehicle) {
            vehicle.status = 'In Stock';
            vehicle.retail_sale_id = null;
            await vehicle.save({ transaction });
        }

        await sale.destroy({ transaction });
        await transaction.commit();
        res.json({ message: 'Đã xóa đơn bán và khôi phục xe vào kho' });
    } catch (error) {
        await transaction.rollback();
        res.status(500).json({ message: error.message });
    }
}
