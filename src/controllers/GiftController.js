const Gift = require('../models/Gift');
const GiftInventory = require('../models/GiftInventory');
const GiftTransaction = require('../models/GiftTransaction');
const Warehouse = require('../models/Warehouse');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

// GET all gift items
exports.getAllGifts = async (req, res) => {
    try {
        const gifts = await Gift.findAll({ order: [['name', 'ASC']] });
        res.json(gifts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CREATE a gift item
exports.createGift = async (req, res) => {
    try {
        const gift = await Gift.create(req.body);
        res.status(201).json(gift);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// UPDATE a gift item
exports.updateGift = async (req, res) => {
    try {
        const gift = await Gift.findByPk(req.params.id);
        if (!gift) return res.status(404).json({ message: 'Không tìm thấy quà tặng' });
        await gift.update(req.body);
        res.json(gift);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// DELETE a gift item
exports.deleteGift = async (req, res) => {
    try {
        const gift = await Gift.findByPk(req.params.id);
        if (!gift) return res.status(404).json({ message: 'Không tìm thấy quà tặng' });
        await gift.destroy();
        res.json({ message: 'Xoá thành công' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET current inventory status
exports.getGiftInventory = async (req, res) => {
    try {
        const { warehouse_id } = req.query;
        let where = {};
        if (warehouse_id) where.warehouse_id = warehouse_id;

        const inventory = await GiftInventory.findAll({
            where,
            include: [
                { model: Gift },
                { model: Warehouse, attributes: ['warehouse_name'] }
            ],
            order: [[Warehouse, 'warehouse_name', 'ASC'], [Gift, 'name', 'ASC']]
        });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET transactions (Diary)
exports.getTransactions = async (req, res) => {
    try {
        const { start_date, end_date, warehouse_id, gift_id, type } = req.query;
        let where = {};
        
        if (start_date && end_date) {
            where.transaction_date = { [Op.between]: [new Date(start_date), new Date(end_date)] };
        }
        if (warehouse_id) where.warehouse_id = warehouse_id;
        if (gift_id) where.gift_id = gift_id;
        if (type) where.type = type;

        const transactions = await GiftTransaction.findAll({
            where,
            include: [
                { model: Gift },
                { model: Warehouse, attributes: ['warehouse_name'] }
            ],
            order: [['transaction_date', 'DESC'], ['createdAt', 'DESC']]
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// IMPORT gifts
exports.importGifts = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { gift_id, warehouse_id, quantity, transaction_date, notes } = req.body;

        const transaction = await GiftTransaction.create({
            gift_id,
            warehouse_id,
            quantity,
            type: 'IMPORT',
            transaction_date: transaction_date || new Date(),
            notes,
            created_by: req.user.id,
            price: req.body.price || (await Gift.findByPk(gift_id))?.price || 0
        }, { transaction: t });

        const [inventory, created] = await GiftInventory.findOrCreate({
            where: { gift_id, warehouse_id },
            defaults: { quantity: 0 },
            transaction: t
        });

        await inventory.increment('quantity', { by: quantity, transaction: t });

        await t.commit();
        res.status(201).json(transaction);
    } catch (error) {
        await t.rollback();
        res.status(400).json({ message: error.message });
    }
};

// EXPORT gifts
exports.exportGifts = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { gift_id, warehouse_id, quantity, type, transaction_date, event_name, notes } = req.body;

        if (!['EXPORT_RETAIL', 'EXPORT_EVENT', 'OTHER_EXPORT'].includes(type)) {
            throw new Error('Loại xuất kho không hợp lệ');
        }

        const inventory = await GiftInventory.findOne({
            where: { gift_id, warehouse_id },
            transaction: t
        });

        if (!inventory || Number(inventory.quantity) < Number(quantity)) {
            throw new Error('Số lượng tồn kho không đủ để xuất');
        }

        const transaction = await GiftTransaction.create({
            gift_id,
            warehouse_id,
            quantity: -quantity, // Export as negative
            type,
            transaction_date: transaction_date || new Date(),
            event_name,
            notes,
            created_by: req.user.id,
            price: (await Gift.findByPk(gift_id))?.price || 0
        }, { transaction: t });

        await inventory.decrement('quantity', { by: quantity, transaction: t });

        await t.commit();
        res.status(201).json(transaction);
    } catch (error) {
        await t.rollback();
        res.status(400).json({ message: error.message });
    }
};
