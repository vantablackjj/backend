const RetailSale = require('../models/RetailSale');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const VehicleType = require('../models/VehicleType');
const VehicleColor = require('../models/VehicleColor');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const MaintenanceOrder = require('../models/MaintenanceOrder');


exports.create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { 
      vehicle_id, customer_name, sale_price, paid_amount, sale_date, notes,
      address, id_card, phone, gender, sale_type, guarantee,
      guarantor_name, guarantor_phone, seller_id, 
      warehouse_id: bodyWH, payment_method, bank_name, contract_number, loan_amount,
      gifts, birthday
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
      birthday,
      seller_id: actualSellerId,

      warehouse_id: activeWarehouseId, // Quan trọng: Truy vết kho bán
      payment_method,
      bank_name,
      contract_number,
      loan_amount,
      created_by: req.user.id,
      gifts: gifts || [],
      used_gifts: [] // Sẽ cập nhật sau khi xử lý trừ kho
    }, { transaction });

    // 2.5. XỬ LÝ QUÀ TẶNG (Trừ kho tự động nếu quà tồn tại trong danh mục)
    const usedGiftsInfo = [];
    if (gifts && Array.isArray(gifts) && gifts.length > 0) {
        const Gift = require('../models/Gift');
        const GiftInventory = require('../models/GiftInventory');
        const GiftTransaction = require('../models/GiftTransaction');

        for (const giftName of gifts) {
            try {
                // Tìm quà theo tên (không phân biệt hoa thường)
                const gift = await Gift.findOne({ 
                    where: { name: { [Op.iLike]: giftName } }, 
                    transaction 
                });

                if (gift) {
                    // Kiểm tra tồn kho tại đúng kho đang bán
                    const inventory = await GiftInventory.findOne({
                        where: { gift_id: gift.id, warehouse_id: activeWarehouseId },
                        transaction
                    });

                    if (inventory && Number(inventory.quantity) > 0) {
                        // Tạo transaction xuất kho
                        await GiftTransaction.create({
                            gift_id: gift.id,
                            warehouse_id: activeWarehouseId,
                            quantity: -1,
                            type: 'EXPORT_RETAIL',
                            transaction_date: sale_date || new Date(),
                            notes: `Tặng kèm xe ${vehicle.engine_no} cho khách ${customer_name}`,
                            created_by: req.user.id
                        }, { transaction });

                        // Trừ kho
                        await inventory.decrement('quantity', { by: 1, transaction });
                        
                        // Lưu lại để sau này biết mà hoàn trả nếu hủy đơn
                        usedGiftsInfo.push({
                            gift_id: gift.id,
                            gift_name: gift.name,
                            quantity: 1
                        });
                    }
                }
            } catch (giftError) {
                console.error(`Lỗi khi xử lý quà tặng ${giftName}:`, giftError.message);
            }
        }
        
        // Cập nhật lại used_gifts cho đơn bán
        if (usedGiftsInfo.length > 0) {
            await sale.update({ used_gifts: usedGiftsInfo }, { transaction });
        }
    }

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

        // 2. Hoàn trả quà tặng vào kho (nếu có)
        if (sale.used_gifts && Array.isArray(sale.used_gifts) && sale.used_gifts.length > 0) {
            const GiftInventory = require('../models/GiftInventory');
            const GiftTransaction = require('../models/GiftTransaction');

            for (const item of sale.used_gifts) {
                try {
                    // Tìm hoặc tạo inventory nếu chưa có (phòng hờ)
                    const [inventory] = await GiftInventory.findOrCreate({
                        where: { gift_id: item.gift_id, warehouse_id: sale.warehouse_id },
                        defaults: { quantity: 0 },
                        transaction
                    });

                    // Tạo transaction nhập lại kho do hủy đơn
                    await GiftTransaction.create({
                        gift_id: item.gift_id,
                        warehouse_id: sale.warehouse_id,
                        quantity: item.quantity || 1,
                        type: 'IMPORT',
                        transaction_date: new Date(),
                        notes: `Hoàn trả quà tặng do HỦY đơn bán lẻ xe ${vehicle?.engine_no || ''}`,
                        created_by: req.user.id
                    }, { transaction });

                    // Cộng lại kho
                    await inventory.increment('quantity', { by: item.quantity || 1, transaction });
                } catch (giftRestoreError) {
                    console.error('Lỗi hoàn trả quà tặng:', giftRestoreError.message);
                }
            }
        }

        await sale.destroy({ transaction });
        await transaction.commit();
        res.json({ message: 'Đã xóa đơn bán và khôi phục xe vào kho' });
    } catch (error) {
        await transaction.rollback();
        res.status(500).json({ message: error.message });
    }
}

exports.updateDisbursement = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_disbursed, disbursed_at } = req.body;

        const sale = await RetailSale.findByPk(id);
        if (!sale) return res.status(404).json({ message: 'Không tìm thấy hóa đơn!' });

        if (req.user.role !== 'ADMIN' && sale.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật hóa đơn của kho khác!' });
        }

        // BIÊN PHÁP BẢO VỆ: Nếu đã giải ngân, chỉ ADMIN mới được phép HỦY (Quay xe)
        if (sale.is_disbursed && !is_disbursed && req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Chỉ Admin mới có quyền hủy xác nhận giải ngân sau khi đã chốt!' });
        }

        await sale.update({
            is_disbursed,
            disbursed_at: is_disbursed ? (disbursed_at || new Date()) : null
        });

        res.json({ message: is_disbursed ? 'Đã xác nhận ngân hàng giải ngân thành công!' : 'Đã hủy xác nhận giải ngân!', sale });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateGuaranteeBook = async (req, res) => {
    try {
        const { id } = req.params;
        const { guarantee_book_issued } = req.body;

        const sale = await RetailSale.findByPk(id);
        if (!sale) return res.status(404).json({ message: 'Không tìm thấy hóa đơn!' });

        if (req.user.role !== 'ADMIN' && sale.warehouse_id !== req.user.warehouse_id) {
            return res.status(403).json({ message: 'Bạn không có quyền cập nhật hóa đơn của kho khác!' });
        }

        await sale.update({
            guarantee_book_issued,
            guarantee_book_issued_at: guarantee_book_issued ? new Date() : null
        });

        res.json({ message: guarantee_book_issued ? 'Đã xác nhận cấp sổ bảo hành!' : 'Đã hủy xác nhận cấp sổ!', sale });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.searchVehicle = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        const whFilter = (req.user.role !== 'ADMIN' && req.user.warehouse_id) ? { warehouse_id: req.user.warehouse_id } : {};

        // 1. Search in Internal Sales (Sold Vehicles)
        // Lưu ý: Đối với xe nội bộ, có thể cho phép xem chéo kho để nhận diện khách hệ thống, 
        // nhưng ở đây ta sẽ tuân thủ yêu cầu cô lập dữ liệu nếu không phải Admin.
        const soldList = await RetailSale.findAll({
            where: {
                ...whFilter,
                [Op.or]: [
                    { engine_no: { [Op.iLike]: `%${q}%` } },
                    { chassis_no: { [Op.iLike]: `%${q}%` } },
                    { phone: { [Op.iLike]: `%${q}%` } }
                ]
            },
            limit: 10,
            include: [
                { 
                    model: Vehicle, 
                    include: [
                        { model: VehicleType, attributes: ['name'] },
                        { model: VehicleColor, attributes: ['color_name'] }
                    ] 
                }
            ]
        });

        // 2. Search in Maintenance Orders (to find previously visited external vehicles)
        const maintenanceList = await MaintenanceOrder.findAll({
            where: {
                ...whFilter,
                [Op.or]: [
                    { engine_no: { [Op.iLike]: `%${q}%` } },
                    { chassis_no: { [Op.iLike]: `%${q}%` } },
                    { customer_phone: { [Op.iLike]: `%${q}%` } },
                    { license_plate: { [Op.iLike]: `%${q}%` } }
                ],
            },
            order: [['createdAt', 'DESC']], // Get most recent orders first
            limit: 50 // Fetch more to allow grouping
        });

        // 3. Combine and Format
        const seenEngineNos = new Set(soldList.map(s => s.engine_no?.toUpperCase()).filter(Boolean));
        const seenLicensePlates = new Set(); // To avoid duplicate external vehicles by plate
        
        const combined = soldList.map(s => ({ ...s.toJSON(), is_internal: true }));

        maintenanceList.forEach(m => {
            const engineNo = m.engine_no?.toUpperCase();
            const licensePlate = m.license_plate?.toUpperCase();
            
            // Skip if this vehicle was already found in soldList (Internal)
            if (engineNo && seenEngineNos.has(engineNo)) return;
            
            // For external vehicles, avoid adding the same vehicle multiple times from different history records
            const shipUniqueKey = engineNo || licensePlate;
            if (shipUniqueKey && !seenLicensePlates.has(shipUniqueKey)) {
                combined.push({
                    ...m.toJSON(),
                    is_internal: false,
                    is_previous_external: true,
                    phone: m.customer_phone,
                    customer_name: m.customer_name,
                    address: m.customer_address
                });
                if (shipUniqueKey) seenLicensePlates.add(shipUniqueKey);
            }
        });

        res.json(combined.slice(0, 15));
    } catch (error) {

        res.status(500).json({ message: error.message });
    }
};

