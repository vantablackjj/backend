const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'test_excel_files');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const generateExcel = (data, fileName) => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, path.join(outputDir, fileName));
  console.log(`Generated: ${fileName}`);
};

// 1. Colors
generateExcel([
  { color_name: 'Đỏ Đen' },
  { color_name: 'Trắng Bạc' },
  { color_name: 'Xanh GP' },
  { color_name: 'Vàng Đồng' },
  { color_name: 'Đen Nhám' }
], '1_Colors_Test.xlsx');

// 2. Vehicle Types
generateExcel([
  { name: 'Vision 2024 Cá Tính', type: 'Xe ga', chassis_prefix: 'RLH', engine_prefix: 'JF62' },
  { name: 'Air Blade 125', type: 'Xe ga', chassis_prefix: 'RLH', engine_prefix: 'JF72' },
  { name: 'Exciter 155 VVA', type: 'Côn tay', chassis_prefix: 'YMT', engine_prefix: 'G3L' },
  { name: 'Future LED', type: 'Xe số', chassis_prefix: 'RLH', engine_prefix: 'JC92' }
], '2_VehicleTypes_Test.xlsx');

// 3. Customers
generateExcel([
  { customer_code: 'KB-HN-001', name: 'Đại lý Thành Công', address: 'Hà Nội', payment_type: 'Trả gộp' },
  { customer_code: 'KB-HP-002', name: 'Xe Máy Hải Phòng', address: 'Hải Phòng', payment_type: 'Trả theo lô' }
], '3_Customers_Test.xlsx');

// 4. Suppliers
generateExcel([
  { name: 'Honda Việt Nam', address: 'Vĩnh Phúc', notes: 'Nhà máy chính', payment_type: 'Trả gộp' },
  { name: 'Yamaha Motor', address: 'Sóc Sơn', notes: 'Head Yamaha', payment_type: 'Trả theo lô' }
], '4_Suppliers_Test.xlsx');

// 5. Purchases (To use this, make sure the colors/types above are imported first or existing)
generateExcel([
  { 
    engine_no: 'JF62E123456', 
    chassis_no: 'RLH62A000001', 
    type_name: 'Vision 2024 Cá Tính', 
    color_name: 'Đỏ Đen', 
    price_vnd: 32000000, 
    supplier_name: 'Honda Việt Nam', 
    warehouse_name: 'Kho Chính',
    purchase_date: '2024-04-01'
  },
  { 
    engine_no: 'JF62E123457', 
    chassis_no: 'RLH62A000002', 
    type_name: 'Vision 2024 Cá Tính', 
    color_name: 'Trắng Bạc', 
    price_vnd: 31500000, 
    supplier_name: 'Honda Việt Nam', 
    warehouse_name: 'Kho Chính',
    purchase_date: '2024-04-01'
  }
], '5_Purchases_Test.xlsx');

// 6. Retail Sales (To test this, engine_no must exist in stock)
generateExcel([
  { 
    sale_date: '2024-04-04', 
    engine_no: 'JF62E123456', 
    customer_name: 'Nguyễn Văn A', 
    phone: '0912345678', 
    address: 'Hà Nội', 
    sale_price: 35000000, 
    paid_amount: 35000000,
    warehouse_name: 'Kho Chính'
  }
], '6_RetailSales_Test.xlsx');

console.log('--- ALL TEST FILES GENERATED IN: ' + outputDir + ' ---');
