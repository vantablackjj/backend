const sequelize = require('../src/config/database');
require('dotenv').config();

// Import Models to register them with Sequelize
require('../src/models/User');
require('../src/models/Warehouse');
require('../src/models/VehicleColor');
require('../src/models/VehicleType');
require('../src/models/Supplier');
require('../src/models/WholesaleCustomer');
require('../src/models/Vehicle');
require('../src/models/RetailSale');
require('../src/models/Expense');
require('../src/models/Purchase');
require('../src/models/WholesaleSale');
require('../src/models/WholesalePayment');
require('../src/models/PurchasePayment');
require('../src/models/Transfer');
require('../src/models/TransferItem');
require('../src/models/TransferLog');
require('../src/models/Notification');
require('../src/models/TransferPayment');
require('../src/models/RetailPayment');
require('../src/models/Income');
require('../src/models/Part');
require('../src/models/PartInventory');
require('../src/models/PartPurchase');
require('../src/models/PartPurchaseItem');
require('../src/models/PartSale');
require('../src/models/PartSaleItem');
require('../src/models/MaintenanceOrder');
require('../src/models/MaintenanceItem');
require('../src/models/Mechanic');
require('../src/models/LiftTable');
require('../src/models/Gift');
require('../src/models/GiftInventory');
require('../src/models/GiftTransaction');

async function sync() {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ Database local đã được khôi phục cấu trúc thành công!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ database:', error);
    process.exit(1);
  }
}

sync();
