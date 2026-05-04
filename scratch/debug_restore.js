const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
require('dotenv').config();

async function debugRestore() {
    const dbUrl = process.env.DATABASE_URL;
    console.log('--- BẮT ĐẦU KIỂM TRA KHÔI PHỤC ---');
    console.log('Database URL:', dbUrl);

    // Tìm file .sql.gz lớn nhất trong thư mục gốc (nếu bạn đã tải về)
    // Hoặc chúng ta sẽ thử giải nén một file cụ thể nếu bạn cung cấp tên
    // Ở đây tôi giả định bạn có một file temp_restore.sql.gz
    const testFile = 'db_backup_ENGLISH_20260430_020001.sql.gz'; // Thay bằng tên file bạn muốn test
    
    if (!fs.existsSync(testFile)) {
        console.log(`❌ Không tìm thấy file ${testFile} ở thư mục backend để test.`);
        process.exit(1);
    }

    try {
        const decompressedPath = 'debug_decompressed.sql';
        console.log('1. Đang giải nén file...');
        await pipeline(
            fs.createReadStream(testFile),
            zlib.createGunzip(),
            fs.createWriteStream(decompressedPath)
        );

        const content = fs.readFileSync(decompressedPath, 'utf8').substring(0, 1000);
        console.log('2. 1000 ký tự đầu tiên của file SQL:\n', content);

        console.log('3. Đang nạp thử vào Database...');
        const restoreCmd = `psql "${dbUrl}" -f "${decompressedPath}"`;
        
        exec(restoreCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Lỗi psql:', error);
                console.error('Stderr:', stderr);
            } else {
                console.log('✅ Kết quả stdout:', stdout);
                console.log('⚠️ Cảnh báo stderr (nếu có):', stderr);
            }
            process.exit(0);
        });
    } catch (err) {
        console.error('❌ Lỗi hệ thống:', err);
        process.exit(1);
    }
}

debugRestore();
