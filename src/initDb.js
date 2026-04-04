const { Client } = require('pg');
require('dotenv').config();

const createDb = async () => {
    // Connect to 'postgres' to create the target database
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASS,
        port: process.env.DB_PORT,
        database: 'postgres'
    });

    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${process.env.DB_NAME}'`);
        if (res.rowCount === 0) {
            await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log(`✅ Cơ sở dữ liệu ${process.env.DB_NAME} đã được tạo thành công.`);
        } else {
            console.log(`ℹ️ Cơ sở dữ liệu ${process.env.DB_NAME} đã tồn tại.`);
        }
    } catch (err) {
        console.error('❌ Lỗi kết nối hoặc tạo Database:', err.message);
        // Try the alternative password if this fails
        // But for now we just show the error.
    } finally {
        await client.end();
    }
};

createDb();
