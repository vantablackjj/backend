const ExcelJS = require('exceljs');
const path = require('path');

async function createTestFile() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mau_Import');

    const headers = ['Số máy', 'Số khung', 'Loại xe', 'Màu sắc', 'Giá nhập', 'Tên NCC', 'Tên kho', 'Ngày nhập'];
    sheet.addRow(headers);

    // Dữ liệu TEST: Thiếu tiền tố
    const data = [
        ['1111111', 'AAA222333', 'Honda Vision 2024', 'Trắng', 35000000, 'Công ty Honda VN', 'Kho chính', '2024-04-09'],
        ['1111112', 'AAA222334', 'Honda Vision 2024', 'Đen', 35000000, 'Công ty Honda VN', 'Kho chính', '2024-04-09'],
        ['1111113', 'AAA222335', 'Honda Vision 2024', 'Đỏ', 35000000, 'Công ty Honda VN', 'Kho chính', '2024-04-09']
    ];

    data.forEach(row => sheet.addRow(row));

    const filePath = path.join(__dirname, '../test_import_missing_prefix.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log('File created at:', filePath);
}

createTestFile().catch(console.error);
