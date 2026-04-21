const PartTransfer = require('../models/PartTransfer');
const PartTransferItem = require('../models/PartTransferItem');
const PartTransferLog = require('../models/PartTransferLog');
const PartInventory = require('../models/PartInventory');
const Part = require('../models/Part');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { sendNotification } = require('../utils/notificationHelper');

// Helper to generate Code (PTF-2026-0001)
const generateCode = async () => {
    const count = await PartTransfer.count();
    const year = new Date().getFullYear();
    const sequence = (count + 1).toString().padStart(4, '0');
    return `PTF-${year}-${sequence}`;
};

// 1. KHO A: Tạo phiếu yêu cầu chuyển kho
exports.requestTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { from_warehouse_id, to_warehouse_id, items, notes } = req.body;
        const user_id = req.user.id;

        const activeFromWH = (req.user.role === 'ADMIN' && from_warehouse_id) ? from_warehouse_id : req.user.warehouse_id;

        if (activeFromWH === to_warehouse_id) {
            throw new Error('Kho xuất và kho nhận không được trùng nhau!');
        }

        const transfer_code = await generateCode();
        const transfer = await PartTransfer.create({
            transfer_code,
            from_warehouse_id: activeFromWH,
            to_warehouse_id,
            notes,
            created_by: user_id,
            status: 'PENDING_ADMIN'
        }, { transaction: t });

        for (const item of items) {
            // item: { part_id, quantity }
            const part = await Part.findByPk(item.part_id, { transaction: t });
            if (!part) throw new Error(`Phụ tùng ID ${item.part_id} không tồn tại!`);

            // Check availability in source warehouse
            const inventory = await PartInventory.findOne({
                where: { part_id: item.part_id, warehouse_id: activeFromWH },
                transaction: t
            });

            if (!inventory || inventory.quantity < item.quantity) {
                throw new Error(`Phụ tùng ${part.name} (${part.code}) không đủ tồn kho để chuyển!`);
            }

            // DEDUCT IMMEDIATELY from source to "reserve" it
            await inventory.decrement('quantity', { by: item.quantity, transaction: t });

            await PartTransferItem.create({
                transfer_id: transfer.id,
                part_id: item.part_id,
                quantity: item.quantity,
                unit: part.unit
            }, { transaction: t });
        }

        await PartTransferLog.create({
            transfer_id: transfer.id,
            user_id: user_id,
            action: 'CREATE',
            details: `Nhân viên ${req.user.username} tạo phiếu chuyển phụ tùng ${transfer_code}`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();

        // Notifications
        const fWH = await Warehouse.findByPk(activeFromWH);
        const tWH = await Warehouse.findByPk(to_warehouse_id);
        
        await sendNotification(req, {
            title: 'Yêu cầu chuyển phụ tùng mới',
            message: `Phiếu ${transfer_code} từ [${fWH?.warehouse_name}] chờ duyệt.`,
            type: 'PART_TRANSFER',
            warehouse_id: activeFromWH,
            link: '/part-inventory' // Or a new transfer list page
        });

        res.status(201).json(transfer);
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 2. ADMIN: Duyệt
exports.approveTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const transfer = await PartTransfer.findByPk(id);
        if (!transfer || transfer.status !== 'PENDING_ADMIN') {
            throw new Error('Phiếu không hợp lệ hoặc đã xử lý!');
        }

        transfer.status = 'ADMIN_APPROVED';
        transfer.approved_by = req.user.id;
        transfer.approved_at = new Date();
        await transfer.save({ transaction: t });

        await PartTransferLog.create({
            transfer_id: transfer.id,
            user_id: req.user.id,
            action: 'APPROVE',
            details: `Admin ${req.user.username} đã duyệt phiếu chuyển phụ tùng.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();

        // Notification for Approve
        const fromWH = await Warehouse.findByPk(transfer.from_warehouse_id);
        const toWH = await Warehouse.findByPk(transfer.to_warehouse_id);
        await sendNotification(req, {
            title: '✅ Đã duyệt chuyển phụ tùng',
            message: `Phiếu ${transfer.transfer_code} từ [${fromWH?.warehouse_name}] đi [${toWH?.warehouse_name}] đã được duyệt.`,
            type: 'PART_TRANSFER_APPROVED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/part-inventory'
        });

        res.json({ message: 'Đã duyệt phiếu chuyển phụ tùng!', transfer });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 3. KHO B: Nhận
exports.receiveTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const transfer = await PartTransfer.findByPk(id, { include: [PartTransferItem] });
        if (!transfer || transfer.status !== 'ADMIN_APPROVED') {
            throw new Error('Phiếu chưa được duyệt hoặc đã nhận rồi!');
        }

        if (req.user.role !== 'ADMIN' && transfer.to_warehouse_id !== req.user.warehouse_id) {
            throw new Error('Bạn không có quyền xác nhận cho kho này!');
        }

        transfer.status = 'RECEIVED';
        transfer.received_by = req.user.id;
        transfer.received_at = new Date();
        await transfer.save({ transaction: t });

        // Add to target warehouse inventory
        for (const item of transfer.PartTransferItems) {
            const [inventory, created] = await PartInventory.findOrCreate({
                where: { part_id: item.part_id, warehouse_id: transfer.to_warehouse_id },
                defaults: { quantity: 0 },
                transaction: t
            });
            await inventory.increment('quantity', { by: item.quantity, transaction: t });
        }

        await PartTransferLog.create({
            transfer_id: id,
            user_id: req.user.id,
            action: 'RECEIVE',
            details: `Nhân viên ${req.user.username} xác nhận đã nhận đủ phụ tùng.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();

        // Notification for Receive
        const fromWH = await Warehouse.findByPk(transfer.from_warehouse_id);
        const toWH = await Warehouse.findByPk(transfer.to_warehouse_id);
        await sendNotification(req, {
            title: '📥 Đã nhận phụ tùng',
            message: `Kho [${toWH?.warehouse_name}] đã xác nhận nhận đủ phụ tùng từ phiếu ${transfer.transfer_code}.`,
            type: 'PART_TRANSFER_RECEIVED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/part-inventory'
        });

        res.json({ message: 'Xác nhận nhận phụ tùng thành công!', transfer });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

// 4. Hủy (Gán lại số lượng về kho cũ)
exports.cancelTransfer = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const transfer = await PartTransfer.findByPk(id, { include: [PartTransferItem] });
        if (transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED') {
            throw new Error('Phiếu đã hoàn tất hoặc đã hủy trước đó!');
        }

        if (req.user.role !== 'ADMIN' && transfer.created_by !== req.user.id) {
            throw new Error('Bạn không có quyền hủy phiếu này!');
        }

        transfer.status = 'CANCELLED';
        await transfer.save({ transaction: t });

        // Restore quantity to source warehouse
        for (const item of transfer.PartTransferItems) {
            const inventory = await PartInventory.findOne({
                where: { part_id: item.part_id, warehouse_id: transfer.from_warehouse_id },
                transaction: t
            });
            if (inventory) {
                await inventory.increment('quantity', { by: item.quantity, transaction: t });
            } else {
                // If inventory vanished?? rare but recreate
                await PartInventory.create({
                    part_id: item.part_id,
                    warehouse_id: transfer.from_warehouse_id,
                    quantity: item.quantity
                }, { transaction: t });
            }
        }

        await PartTransferLog.create({
            transfer_id: id,
            user_id: req.user.id,
            action: 'CANCEL',
            details: `Hủy phiếu chuyển kho. Phụ tùng đã được hoàn trả về kho xuất.`,
            timestamp: new Date()
        }, { transaction: t });

        await t.commit();

        // Notification for Cancel
        const fromWH = await Warehouse.findByPk(transfer.from_warehouse_id);
        await sendNotification(req, {
            title: '❌ Đã hủy chuyển phụ tùng',
            message: `Phiếu chuyển ${transfer.transfer_code} đã bị hủy. Phụ tùng đã hoàn về kho [${fromWH?.warehouse_name}].`,
            type: 'PART_TRANSFER_CANCELLED',
            warehouse_id: transfer.from_warehouse_id,
            link: '/part-inventory'
        });

        res.json({ message: 'Đã hủy phiếu chuyển phụ tùng.' });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

exports.getTransfers = async (req, res) => {
    try {
        const where = {};
        if (req.user.role !== 'ADMIN') {
            where[Op.or] = [
                { from_warehouse_id: req.user.warehouse_id },
                { to_warehouse_id: req.user.warehouse_id }
            ];
        }
        const list = await PartTransfer.findAll({
            where,
            include: [
                { model: Warehouse, as: 'FromWarehouse', attributes: ['warehouse_name'] },
                { model: Warehouse, as: 'ToWarehouse', attributes: ['warehouse_name'] },
                { model: User, as: 'creator', attributes: ['full_name'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const transfer = await PartTransfer.findByPk(id, {
            include: [
                { model: Warehouse, as: 'FromWarehouse', attributes: ['warehouse_name'] },
                { model: Warehouse, as: 'ToWarehouse', attributes: ['warehouse_name'] },
                { model: User, as: 'creator', attributes: ['full_name', 'username'] }
            ]
        });
        const items = await PartTransferItem.findAll({ 
            where: { transfer_id: id },
            include: [{ model: Part, attributes: ['code', 'name', 'unit'] }]
        });
        const logs = await PartTransferLog.findAll({ where: { transfer_id: id }, order: [['timestamp', 'ASC']] });

        res.json({ transfer, items, logs });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
