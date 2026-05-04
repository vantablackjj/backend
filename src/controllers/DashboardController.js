const RetailSale = require('../models/RetailSale');
const WholesaleSale = require('../models/WholesaleSale');
const Purchase = require('../models/Purchase');
const Vehicle = require('../models/Vehicle');
const Warehouse = require('../models/Warehouse');
const Expense = require('../models/Expense');
const Income = require('../models/Income');

const { Op } = require('sequelize');
const sequelize = require('../config/database');
const PartSale = require('../models/PartSale');
const PartPurchase = require('../models/PartPurchase');
const PartInventory = require('../models/PartInventory');
const MaintenanceOrder = require('../models/MaintenanceOrder');
const MaintenanceItem = require('../models/MaintenanceItem');
const GiftTransaction = require('../models/GiftTransaction');
const Gift = require('../models/Gift');
const PartSaleItem = require('../models/PartSaleItem');
const Part = require('../models/Part');
const dayjs = require('dayjs');

exports.getStats = async (req, res) => {
    try {
        const { warehouse_id, from_date, to_date } = req.query;

        // Default range: current month
        const start_date = from_date || dayjs().startOf('month').format('YYYY-MM-DD');
        const end_date = to_date || dayjs().endOf('month').format('YYYY-MM-DD');
        const tz = 'Asia/Ho_Chi_Minh';

        // Specific where for each table to avoid ambiguity
        const dateFilter = (col, from, to) => [
            sequelize.where(sequelize.fn('date', sequelize.fn('timezone', tz, sequelize.col(col))), { [Op.between]: [from, to] })
        ];

        let retailWhere = { [Op.and]: dateFilter('sale_date', start_date, end_date) };
        let wholesaleWhere = { [Op.and]: dateFilter('sale_date', start_date, end_date) };
        let purchaseWhere = { [Op.and]: dateFilter('purchase_date', start_date, end_date) };
        let expenseWhere = { [Op.and]: dateFilter('expense_date', start_date, end_date) };
        let incomeWhere = { [Op.and]: dateFilter('income_date', start_date, end_date) };

        if (req.user.role !== 'ADMIN') {
            expenseWhere.is_internal = { [Op.ne]: true };
            incomeWhere.is_internal = { [Op.ne]: true };
        }

        let vehicleWhere = {};

        if (warehouse_id) {
            retailWhere.warehouse_id = warehouse_id;
            wholesaleWhere.warehouse_id = warehouse_id;
            purchaseWhere.warehouse_id = warehouse_id;
            expenseWhere.warehouse_id = warehouse_id; // If expense has warehouse_id
            incomeWhere.warehouse_id = warehouse_id;
            vehicleWhere.warehouse_id = warehouse_id;
        }


        // 1. Doanh thu bán lẻ
        const retailStats = await RetailSale.findOne({
            where: retailWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_price')), 'revenue'],
                [sequelize.fn('SUM', sequelize.col('paid_amount')), 'paid']
            ],
            raw: true
        });

        // 2. Doanh thu bán buôn
        const wholesaleStats = await WholesaleSale.findOne({
            where: wholesaleWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount_vnd')), 'revenue']
            ],
            raw: true
        });

        // 3. Chi phí nhập hàng
        const purchaseStats = await Purchase.findOne({
            where: purchaseWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount_vnd')), 'spent']
            ],
            raw: true
        });

        // 4. Giá vốn hàng bán (COGS) cho Xe Bán Lẻ
        const retailItems = await RetailSale.findAll({
            where: retailWhere,
            include: [{ model: Vehicle, attributes: ['price_vnd'] }]
        });
        const retailCOGS = retailItems.reduce((sum, item) => sum + (Number(item.Vehicle?.price_vnd) || 0), 0);

        // 5. Giá vốn hàng bán (COGS) cho Xe Bán Buôn
        const wholesaleV = await WholesaleSale.findAll({
            where: wholesaleWhere,
            include: [{ model: Vehicle, attributes: ['price_vnd'] }]
        });
        const wholesaleCOGS = wholesaleV.reduce((sum, sale) => {
            // Note: Alias pluralization depends on definition. 
            // In server.js: WholesaleSale.hasMany(Vehicle) -> default alias is Vehicles
            const vehicles = sale.Vehicles || [];
            return sum + vehicles.reduce((s, v) => s + (Number(v.price_vnd) || 0), 0);
        }, 0);

        // 6. Các chi phí vận hành khác (Expense)
        const hasExpenseCategory = Expense.rawAttributes && Expense.rawAttributes.category;
        const expenseBreakdown = await Expense.findAll({
            where: expenseWhere,
            attributes: [
                [hasExpenseCategory ? 'category' : 'content', 'category'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            group: [hasExpenseCategory ? 'category' : 'content'],
            raw: true
        });
        const otherExpenses = expenseBreakdown.reduce((sum, item) => sum + Number(item.total), 0);

        // 6b. Other Incomes
        const incomeBreakdown = await Income.findAll({
            where: incomeWhere,
            attributes: [
                ['content', 'category'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'total']
            ],
            group: ['content'],
            raw: true
        });
        const otherIncomes = incomeBreakdown.reduce((sum, item) => sum + Number(item.total), 0);


        // 7. Tồn kho HIỆN TẠI (In Stock)
        const allStockVehicles = await Vehicle.findAll({
            where: { ...vehicleWhere, status: 'In Stock' },
            include: [{ model: Purchase, attributes: ['purchase_date'] }]
        });

        const inventorySize = allStockVehicles.length;

        // 8. Xe tồn kho trên 40 ngày (Sử dụng logic đồng bộ với báo cáo tồn kho)
        const fortyDaysAgo = dayjs().subtract(40, 'days').startOf('day');
        const agingVehicles = allStockVehicles.filter(v => {
            const date = v.Purchase?.purchase_date || v.createdAt;
            // Chỉ tính những xe có ngày nhập hợp lệ và đã quá 40 ngày
            const dayjsDate = dayjs(date);
            return dayjsDate.isValid() && dayjsDate.isBefore(fortyDaysAgo);
        }).length;

        // 9. Phụ tùng - Doanh thu bán lẻ & buôn
        let partSaleSpecificWhere = { [Op.and]: dateFilter('sale_date', start_date, end_date) };
        if (warehouse_id) partSaleSpecificWhere.warehouse_id = warehouse_id;

        const partSaleStats = await PartSale.findOne({
            where: partSaleSpecificWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue']
            ],
            raw: true
        });

        // 10. Phụ tùng - Nhập hàng
        let partPurchaseSpecificWhere = { [Op.and]: dateFilter('purchase_date', start_date, end_date) };
        if (warehouse_id) partPurchaseSpecificWhere.warehouse_id = warehouse_id;

        const partPurchaseStats = await PartPurchase.findOne({
            where: partPurchaseSpecificWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount')), 'spent']
            ],
            raw: true
        });

        // 11. Dịch vụ sửa chữa (Maintenance)
        let mainSpecificWhere = { 
            [Op.and]: [
                ...dateFilter('maintenance_date', start_date, end_date),
                { status: 'COMPLETED' }
            ]
        };
        if (warehouse_id) mainSpecificWhere.warehouse_id = warehouse_id;

        const maintenanceStats = await MaintenanceOrder.findOne({
            where: mainSpecificWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue']
            ],
            raw: true
        });

        // 12. Tồn kho phụ tùng (Số lượng mã hàng còn tồn)
        const partInventoryCount = await PartInventory.count({
            where: { 
                ...(warehouse_id ? { warehouse_id } : {}),
                quantity: { [Op.gt]: 0 }
            }
        });

        // 13. Chi phí quà tặng (Khuyến mại)
        const giftTransactions = await GiftTransaction.findAll({
            where: {
                type: { [Op.in]: ['EXPORT_RETAIL', 'EXPORT_EVENT', 'OTHER_EXPORT'] },
                [Op.and]: dateFilter('transaction_date', start_date, end_date),
                ...(warehouse_id ? { warehouse_id } : {})
            },
            attributes: ['quantity', 'price']
        });
        const giftCost = giftTransactions.reduce((sum, t) => sum + (Math.abs(Number(t.quantity)) * Number(t.price || 0)), 0);

        // 14. COGS cho Dịch vụ & Phụ tùng
        const maintenanceItems = await MaintenanceItem.findAll({
            include: [{
                model: MaintenanceOrder,
                where: mainSpecificWhere,
                attributes: []
            }],
            attributes: ['quantity', 'purchase_price']
        });
        const maintenanceCOGS = maintenanceItems.reduce((sum, item) => sum + (Number(item.purchase_price) * Number(item.quantity) || 0), 0);

        const partSaleItems = await PartSaleItem.findAll({
            include: [
                {
                    model: PartSale,
                    where: partSaleSpecificWhere,
                    attributes: []
                },
                {
                    model: Part,
                    attributes: ['purchase_price']
                }
            ],
            attributes: ['quantity']
        });
        const partSaleCOGS = partSaleItems.reduce((sum, item) => sum + (Number(item.Part?.purchase_price || 0) * Number(item.quantity) || 0), 0);


        const totalRevenue = (Number(retailStats?.revenue) || 0) + 
                             (Number(wholesaleStats?.revenue) || 0) + 
                             (Number(partSaleStats?.revenue) || 0) + 
                             (Number(maintenanceStats?.revenue) || 0) +
                             (Number(otherIncomes) || 0);

        const totalCOGS = retailCOGS + wholesaleCOGS + maintenanceCOGS + partSaleCOGS;
        const totalProfit = totalRevenue - totalCOGS - (Number(otherExpenses) || 0) - giftCost;


        res.json({
            retail: { ...retailStats, cogs: retailCOGS },
            wholesale: { ...wholesaleStats, cogs: wholesaleCOGS },
            purchase: purchaseStats,
            parts: {
                sales: partSaleStats,
                purchase: partPurchaseStats,
                inventoryCount: partInventoryCount
            },
            maintenance: maintenanceStats,
            expenses: otherExpenses || 0,
            expenseBreakdown: expenseBreakdown.map(e => ({ category: e.category || 'Khác', total: Number(e.total) })),
            giftCost,
            otherIncomes: otherIncomes || 0,
            incomeBreakdown: incomeBreakdown.map(i => ({ category: i.category || 'Khác', total: Number(i.total) })),
            inventorySize,

            agingVehicles,
            totalRevenue,
            totalCOGS,
            maintenanceCOGS,
            partSaleCOGS,
            totalProfit,
            period: { start: start_date, end: end_date }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
