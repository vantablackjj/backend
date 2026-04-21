const RetailSale = require('../models/RetailSale');
const WholesaleSale = require('../models/WholesaleSale');
const Purchase = require('../models/Purchase');
const Vehicle = require('../models/Vehicle');
const Warehouse = require('../models/Warehouse');
const Expense = require('../models/Expense');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const PartSale = require('../models/PartSale');
const PartPurchase = require('../models/PartPurchase');
const PartInventory = require('../models/PartInventory');
const MaintenanceOrder = require('../models/MaintenanceOrder');
const MaintenanceItem = require('../models/MaintenanceItem');

exports.getStats = async (req, res) => {
    try {
        const { warehouse_id, from_date, to_date } = req.query;

        // Default range: current month
        const start = from_date ? new Date(from_date) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = to_date ? new Date(to_date) : new Date();
        end.setHours(23, 59, 59, 999);

        // Specific where for each table to avoid ambiguity
        let retailWhere = { sale_date: { [Op.between]: [start, end] } };
        let wholesaleWhere = { sale_date: { [Op.between]: [start, end] } };
        let purchaseWhere = { purchase_date: { [Op.between]: [start, end] } };
        let expenseWhere = { createdAt: { [Op.between]: [start, end] } };
        let vehicleWhere = {};

        if (warehouse_id) {
            retailWhere.warehouse_id = warehouse_id;
            wholesaleWhere.warehouse_id = warehouse_id;
            purchaseWhere.warehouse_id = warehouse_id;
            expenseWhere.warehouse_id = warehouse_id; // If expense has warehouse_id
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
        // Check if Expense has warehouse_id column, if not, adjust
        const hasWarehouseId = (Expense.rawAttributes && Expense.rawAttributes.warehouse_id);
        const expWhere = hasWarehouseId ? expenseWhere : { createdAt: expenseWhere.createdAt };
        const otherExpenses = await Expense.sum('amount', { where: expWhere });

        // 7. Tồn kho HIỆN TẠI (In Stock)
        const inventorySize = await Vehicle.count({
            where: { ...vehicleWhere, status: 'In Stock' }
        });

        // 8. Xe tồn kho trên 60 ngày
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const agingVehicles = await Vehicle.count({
            where: { 
                ...vehicleWhere, 
                status: 'In Stock',
                createdAt: { [Op.lt]: sixtyDaysAgo }
            }
        });

        // 9. Phụ tùng - Doanh thu bán lẻ & buôn
        let partSaleSpecificWhere = { sale_date: { [Op.between]: [start, end] } };
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
        let partPurchaseSpecificWhere = { purchase_date: { [Op.between]: [start, end] } };
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
            maintenance_date: { [Op.between]: [start, end] },
            status: 'COMPLETED'
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

        const totalRevenue = (Number(retailStats?.revenue) || 0) + 
                             (Number(wholesaleStats?.revenue) || 0) + 
                             (Number(partSaleStats?.revenue) || 0) + 
                             (Number(maintenanceStats?.revenue) || 0);

        const totalCOGS = retailCOGS + wholesaleCOGS;
        const totalProfit = totalRevenue - totalCOGS - (Number(otherExpenses) || 0);

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
            inventorySize,
            agingVehicles,
            totalRevenue,
            totalCOGS,
            totalProfit,
            period: { start, end }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
