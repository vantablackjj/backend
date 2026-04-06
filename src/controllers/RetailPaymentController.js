const RetailPayment = require('../models/RetailPayment');
const RetailSale = require('../models/RetailSale');
const sequelize = require('../config/database');

exports.addPayment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { retail_sale_id, amount, payment_date, payment_method, notes } = req.body;

        const sale = await RetailSale.findByPk(retail_sale_id, { transaction });
        if (!sale) throw new Error('Không tìm thấy hóa đơn bán lẻ!');

        // 1. Create Payment
        const payment = await RetailPayment.create({
            retail_sale_id,
            amount,
            payment_date,
            payment_method,
            notes,
            created_by: req.user.id
        }, { transaction });

        // 2. Update RetailSale paid_amount
        sale.paid_amount = Number(sale.paid_amount) + Number(amount);
        await sale.save({ transaction });

        await transaction.commit();
        res.status(201).json({ message: 'Đã thêm khoản thanh toán thành công!', payment });
    } catch (error) {
        await transaction.rollback();
        res.status(400).json({ message: error.message });
    }
};

exports.getPaymentsBySale = async (req, res) => {
    try {
        const { id } = req.params;
        const payments = await RetailPayment.findAll({
            where: { retail_sale_id: id },
            order: [['payment_date', 'ASC']]
        });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

exports.deletePayment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const payment = await RetailPayment.findByPk(id, { transaction });
        if (!payment) throw new Error('Không tìm thấy khoản thanh toán!');

        const sale = await RetailSale.findByPk(payment.retail_sale_id, { transaction });
        if (sale) {
            sale.paid_amount = Number(sale.paid_amount) - Number(payment.amount);
            await sale.save({ transaction });
        }

        await payment.destroy({ transaction });
        await transaction.commit();
        res.json({ message: 'Đã xóa khoản thanh toán và cập nhật lại số tiền đã trả' });
    } catch (error) {
        await transaction.rollback();
        res.status(500).json({ message: error.message });
    }
}
