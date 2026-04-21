const Transfer = require('../models/Transfer');
const TransferItem = require('../models/TransferItem');
const TransferLog = require('../models/TransferLog');
const Notification = require('../models/Notification');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const TransferPayment = require('../models/TransferPayment');

const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Helper to emit notification via Socket.io
const { sendNotification } = require('../utils/notificationHelper');

// Helper to generate Transfer Code (e.g., TF-2026-0001)
const generateCode = async () => {
    const count = await Transfer.count();
    const year = new Date().getFullYear();
    const sequence = (count + 1).toString().padStart(4, '0');
    return `TF-${year}-${sequence}`;
};

// 1. KHO A: Tạo phiếu yêu cầu chuyển kho
exports.requestTransfer = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { from_warehouse_id, to_warehouse_id, vehicle_ids, notes } = req.body;
        const user_id = req.user.id; 

        // XÁC ĐỊNH KHO GỐC (Source of Truth)
        const activeFromWH = (req.user.role === 'ADMIN' && from_warehouse_id) ? from_warehouse_id : req.user.warehouse_id;

        if (activeFromWH === to_warehouse_id) {
            throw new Error('Kho xuất và kho nhận không được trùng nhau!');
        }

        // 1. Kiểm tra xe (Phải thuộc kho gốc và đang Sẵn sàng)
        const vehicles = await Vehicle.findAll({ 
            where: { 
                id: vehicle_ids, 
                warehouse_id: activeFromWH, 
                status: 'In Stock',
                is_locked: false 
            } 
        });

        if (vehicles.length !== vehicle_ids.length) {
            throw new Error('Một số xe không tồn tại trong kho gốc chọn hoặc đã bán/đang chuyển!');
        }

        // 2. Tính tổng tiền (Dựa trên giá nhập gốc price_vnd của bảng Vehicle)
        const total_amount = vehicles.reduce((sum, v) => sum + (Number(v.price_vnd) || 0), 0);

        // 3. Tạo phiếu
        const transfer_code = await generateCode();
        const transfer = await Transfer.create({
            transfer_code,
            from_warehouse_id: activeFromWH,
            to_warehouse_id,
            total_amount,
            notes,
            created_by: user_id,
            status: 'PENDING_ADMIN'
        }, { transaction });


        // 4. Tạo chi tiết và Cập nhật trạng thái xe (Khóa xe)
        for (const v of vehicles) {
            await TransferItem.create({
                transfer_id: transfer.id,
                vehicle_id: v.id,
                original_price: v.price_vnd
            }, { transaction });

            v.status = 'Transferring';
            v.is_locked = true; // KHÓA XE
            await v.save({ transaction });
        }


        // Tạo log
        await TransferLog.create({
            transfer_id: transfer.id,
            user_id: req.user.id,
            action: 'CREATE',
            details: `Nhân viên ${req.user.username} tạo phiếu chuyển ${transfer_code}`,
            timestamp: new Date()
        }, { transaction });

        await transaction.commit();

        const Warehouse = require('../models/Warehouse');
        const fromWH = await Warehouse.findByPk(activeFromWH);
        const toWH = await Warehouse.findByPk(to_warehouse_id);

        // Gửi thông báo cho Admin (ngoài transaction)
        await sendNotification(req, {
            title: 'Yêu cầu chuyển kho mới',
            message: `Nhân viên ${req.user.full_name} yêu cầu chuyển phiếu ${transfer_code} từ [${fromWH?.warehouse_name || 'N/A'}] sang [${toWH?.warehouse_name || 'N/A'}].`,
            type: 'TRANSFER_REQUEST',
            warehouse_id: activeFromWH, // Thông báo tại kho xuất
            link: '/transfers'
        });
        await sendNotification(req, {
            title: 'Tin xe sắp chuyển đến',
            message: `Phiếu ${transfer_code} từ [${fromWH?.warehouse_name || 'N/A'}] đang chờ duyệt để chuyển về kho của bạn.`,
            type: 'TRANSFER_REQUEST',
            warehouse_id: to_warehouse_id, // Thông báo tại kho nhận
            link: '/transfers'
        });


        res.status(201).json(transfer);

    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 2. ADMIN: Duyệt phiếu chuyển (Xác nhận xuất kho)
exports.approveTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        
        const transfer = await Transfer.findByPk(id);
        if (!transfer || transfer.status !== 'PENDING_ADMIN') {
            throw new Error('Phiếu không hợp lệ hoặc đã được xử lý!');
        }

        // Cập nhật từng xe (Gia cố: đảm bảo xe vẫn ở đúng kho và trạng thái đang chờ)
        const items = await TransferItem.findAll({ where: { transfer_id: id } });
        for (const item of items) {
            const vehicle = await Vehicle.findByPk(item.vehicle_id);
            if (!vehicle || vehicle.status !== 'Transferring') {
                 // Nếu xe không còn ở trạng thái đang chuyển (ví dụ bị admin can thiệp), ta dùng lỗi
                 throw new Error(`Xe ${vehicle?.engine_no || ''} không còn ở trạng thái chờ duyệt chuyển!`);
            }
        }

        // Cập nhật trạng thái phiếu
        transfer.status = 'ADMIN_APPROVED';
        transfer.approved_by = req.user.id;
        transfer.approved_at = new Date();
        await transfer.save({ transaction: t });

        // Log
        await TransferLog.create({
            transfer_id: transfer.id,
            user_id: req.user.id,
            action: 'APPROVE',
            details: `Admin ${req.user.username} đã duyệt phiếu. Xe đang đi đường.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();

        // Thông báo cho Kho nhận (ngoài transaction)
        await sendNotification(req, {
            title: 'Phiếu đã được duyệt',
            message: `Phiếu ${transfer.transfer_code} đã được Admin duyệt. Xe đang chuẩn bị xuất.`,
            type: 'TRANSFER_APPROVED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/transfers'
        });
        await sendNotification(req, {
            title: 'Xe đang trên đường tới',
            message: `Phiếu ${transfer.transfer_code} đã được duyệt. Vui lòng chuẩn bị nhận hàng.`,
            type: 'TRANSFER_APPROVED',
            warehouse_id: transfer.to_warehouse_id,
            link: '/transfers'
        });

        res.json({ message: 'Duyệt phiếu thành công!', transfer });

    } catch (error) {
        await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 3. KHO B: Xác nhận đã nhận hàng (Hoàn tất)
exports.receiveTransfer = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const user_id = req.user.id;
        
        const transfer = await Transfer.findByPk(id);
        if (!transfer || transfer.status !== 'ADMIN_APPROVED') {
            throw new Error('Phiếu chưa được Admin duyệt hoặc đã nhận rồi!');
        }

        // KIỂM TRA QUYỀN NHẬN (Phải thuộc kho đích hoặc Admin)
        if (req.user.role !== 'ADMIN' && transfer.to_warehouse_id !== req.user.warehouse_id) {
            throw new Error('Bạn không có quyền xác nhận nhận xe cho kho này!');
        }

        // Cập nhật trạng thái phiếu
        transfer.status = 'RECEIVED';
        transfer.received_by = user_id;
        transfer.received_at = new Date();
        await transfer.save({ transaction });

        // Cập nhật từng xe sang Kho B (Mở khóa xe)
        const items = await TransferItem.findAll({ where: { transfer_id: id } });
        for (const item of items) {
            const vehicle = await Vehicle.findByPk(item.vehicle_id);
            if (vehicle) {
                // BUG FIX: Only update location/status if the vehicle is actually part of the transfer flow.
                // If it was already sold (via a concurrent or back-dated process), we should NOT move its logical location.
                if (vehicle.status === 'Transferring') {
                    vehicle.warehouse_id = transfer.to_warehouse_id;
                    vehicle.status = 'In Stock';
                } else if (vehicle.status === 'Sold') {
                    // If it's sold, we keep its status. We should also probably keep its warehouse as where it was sold from.
                    // But we MUST unlock it so it's not stuck.
                    console.log(`[Transfer] Vehicle ${vehicle.engine_no} was already sold. Keeping status.`);
                }
                
                vehicle.is_locked = false; // Always unlock when transfer completes
                await vehicle.save({ transaction });
            }
        }


        await TransferLog.create({
            transfer_id: id,
            user_id: req.user.id,
            action: 'RECEIVE',
            details: `Nhân viên ${req.user.username} đã xác nhận nhận đủ hàng. Xe đã vào kho B.`,
            timestamp: new Date()
        }, { transaction });

        await transaction.commit();

        // Thông báo cho Admin (ngoài transaction)
        await sendNotification(req, {
            title: 'Chuyển kho hoàn tất',
            message: `Phiếu ${transfer.transfer_code} đã được nhận đủ.`,
            type: 'TRANSFER_RECEIVED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/transfers'
        });
        await sendNotification(req, {
            title: 'Đã nhập kho thành công',
            message: `Xe từ phiếu ${transfer.transfer_code} đã vào kho của bạn.`,
            type: 'TRANSFER_RECEIVED',
            warehouse_id: transfer.to_warehouse_id,
            link: '/transfers'
        });

        res.json({ message: 'Nhận hàng thành công!', transfer });

    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 4. Danh sách phiếu (Phân quyền: staff chỉ thấy phiếu liên quan kho của họ, admin thấy hết)
exports.getTransfers = async (req, res) => {
    try {
        const { status } = req.query;
        let where = {};
        if (status) where.status = status;
        
        if (req.user.role !== 'ADMIN' && req.user.warehouse_id) {
            where[Op.or] = [
                { from_warehouse_id: req.user.warehouse_id },
                { to_warehouse_id: req.user.warehouse_id }
            ];
        }

        const list = await Transfer.findAll({ 
            where, 
            order: [['createdAt', 'DESC']],
        });
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const transfer = await Transfer.findByPk(id, {
            include: [{ model: User, as: 'creator', attributes: ['full_name', 'username'] }]
        });
        const items = await TransferItem.findAll({ where: { transfer_id: id } });
        const vehicleIds = items.map(i => i.vehicle_id);
        const vehicles = await Vehicle.findAll({ 
            where: { id: vehicleIds },
            include: [
                { model: require('../models/VehicleType'), as: 'VehicleType', attributes: ['name'] },
                { model: require('../models/VehicleColor'), as: 'VehicleColor', attributes: ['color_name'] }
            ]
        });
        const logs = await TransferLog.findAll({ where: { transfer_id: id }, order: [['timestamp', 'ASC']] });
        const payments = await TransferPayment.findAll({ where: { transfer_id: id }, order: [['payment_date', 'ASC']] });

        res.json({ transfer, vehicles, logs, payments });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.cancelTransfer = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const user_id = req.user.id;
        
        const transfer = await Transfer.findByPk(id);
        if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') {
             throw new Error('Không thể hủy phiếu đã hoàn tất hoặc đã hủy!');
        }

        // KIỂM TRA QUYỀN HỦY (Chỉ Admin hoặc người tạo mới có quyền hủy)
        if (req.user.role !== 'ADMIN' && transfer.created_by !== req.user.id) {
            throw new Error('Bạn không có quyền hủy phiếu này!');
        }

        transfer.status = 'CANCELLED';
        await transfer.save({ transaction });

        // Trả xe về In Stock ở kho cũ (Mở khóa xe)
        const items = await TransferItem.findAll({ where: { transfer_id: id } });
        for (const item of items) {
            const vehicle = await Vehicle.findByPk(item.vehicle_id);
            if (vehicle) {
                // CHỈ cập nhật về 'In Stock' nếu xe ĐANG ở trạng thái 'Transferring'
                // Điều này cực kỳ quan trọng để không "hủy" trạng thái Đã bán nếu một xe somehow bị bán khi đang chờ chuyển.
                if (vehicle.status === 'Transferring') {
                    vehicle.status = 'In Stock';
                }
                vehicle.is_locked = false; // MỞ KHÓA KHI HỦY
                await vehicle.save({ transaction });
            }
        }


        await TransferLog.create({
            transfer_id: id,
            user_id: req.user.id,
            action: 'CANCEL',
            details: `Người dùng ${req.user.username} đã hủy phiếu chuyển kho.`,
            timestamp: new Date()
        }, { transaction });

        await transaction.commit();

        // Notification: Cancel
        const Warehouse = require('../models/Warehouse');
        const fromWH = await Warehouse.findByPk(transfer.from_warehouse_id);
        const toWH = await Warehouse.findByPk(transfer.to_warehouse_id);
        
        await sendNotification(req, {
            title: '❌ Phiếu chuyển đã hủy',
            message: `Phiếu chuyển xe ${transfer.transfer_code} từ [${fromWH?.warehouse_name}] đi [${toWH?.warehouse_name}] đã bị hủy. Xe đã được mở khóa.`,
            type: 'TRANSFER_CANCELLED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/transfers'
        });

        res.json({ message: 'Đã hủy phiếu chuyển kho.' });
    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
}

// ADMIN EDIT TRANSFER
exports.updateTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Chỉ Admin mới có quyền sửa phiếu!' });

        const { id } = req.params;
        const { vehicle_ids, notes, to_warehouse_id, from_warehouse_id } = req.body;

        const transfer = await Transfer.findByPk(id, { include: [TransferItem] });
        if (!transfer || transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') {
            return res.status(400).json({ message: 'Phiếu không thể chỉnh sửa ở trạng thái này!' });
        }

        // 1. Phục hồi trạng thái 'In Stock' (nếu đang Transferring) và MỞ KHÓA cho danh sách xe cũ
        const oldVehicleIds = transfer.TransferItems.map(ti => ti.vehicle_id);
        const oldVehicles = await Vehicle.findAll({ where: { id: oldVehicleIds }, transaction: t });
        for (const v of oldVehicles) {
            if (v.status === 'Transferring') {
                v.status = 'In Stock';
            }
            v.is_locked = false;
            await v.save({ transaction: t });
        }

        // 2. Xóa các TransferItem cũ
        await TransferItem.destroy({ where: { transfer_id: id }, transaction: t });

        // 3. Kiểm tra xe mới (Phải thuộc kho xuất và đang Sẵn sàng)
        const activeFromWH = from_warehouse_id;
        const newVehicles = await Vehicle.findAll({ 
            where: { 
                id: vehicle_ids, 
                warehouse_id: activeFromWH,
                status: 'In Stock',
                is_locked: false
            }, 
            transaction: t 
        });

        if (newVehicles.length !== vehicle_ids.length) {
            throw new Error('Một số xe mới chọn không có trong kho xuất, đã bán hoặc đang ở phiếu chuyển khác!');
        }

        let totalVal = 0;
        for (const v of newVehicles) {
            totalVal += Number(v.price_vnd || 0);
            v.status = 'Transferring';
            v.is_locked = true; // KHÓA XE MỚI
            await v.save({ transaction: t });
            
            await TransferItem.create({ 
                transfer_id: id, 
                vehicle_id: v.id, 
                original_price: v.price_vnd 
            }, { transaction: t });
        }


        // 4. Cập nhật phiếu
        transfer.total_amount = totalVal;
        transfer.from_warehouse_id = from_warehouse_id;
        transfer.to_warehouse_id = to_warehouse_id;
        transfer.notes = notes;
        await transfer.save({ transaction: t });

        // 5. Log chỉnh sửa
        await TransferLog.create({
            transfer_id: id,
            user_id: req.user.id,
            action: 'EDIT',
            details: `Admin ${req.user.username} đã chỉnh sửa nội dung phiếu.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Đã cập nhật phiếu chuyển kho!' });
    } catch (e) {
        await t.rollback();
        res.status(500).json({ message: e.message });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        let where = {};
        if (req.user.role !== 'ADMIN') {
            where.user_id = req.user.id;
        }
        const list = await Notification.findAll({ where, order: [['createdAt', 'DESC']], limit: 20 });
        res.json(list);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.update({ is_read: true }, { where: { id } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

exports.addPayment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { transfer_id, amount_paid_vnd, payment_date, payment_method, notes } = req.body;
        
        const transfer = await Transfer.findByPk(transfer_id);
        if (!transfer) throw new Error('Không tìm thấy phiếu chuyển!');

        // 1. Tạo bản ghi thanh toán
        await TransferPayment.create({
            transfer_id,
            amount_paid_vnd,
            payment_date: payment_date || new Date(),
            payment_method: payment_method || 'Cash',
            notes,
            created_by: req.user.id
        }, { transaction: t });

        // 2. Cập nhật số tiền đã trả trên phiếu
        const newPaidAmount = Number(transfer.paid_amount_vnd || 0) + Number(amount_paid_vnd);
        transfer.paid_amount_vnd = newPaidAmount;
        await transfer.save({ transaction: t });

        // 3. Log
        await TransferLog.create({
            transfer_id,
            user_id: req.user.id,
            action: 'PAYMENT',
            details: `Đã thanh toán ${Number(amount_paid_vnd).toLocaleString()} đ qua ${payment_method}.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Ghi nhận thanh toán thành công!', paid_amount: transfer.paid_amount_vnd });
    } catch (e) {
        await t.rollback();
        res.status(500).json({ message: e.message });
    }
};

