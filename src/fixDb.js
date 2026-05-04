const { QueryTypes } = require('sequelize');
const sequelize = require('./config/database');

async function fixDatabaseSchema() {
  try {
    console.log('🔍 Đang kiểm tra cấu trúc database...');
    
    // Kiểm tra xem cột accessible_warehouses đã tồn tại trong bảng Users chưa
    const tableInfo = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Users' AND column_name = 'accessible_warehouses'",
      { type: QueryTypes.SELECT }
    );

    if (tableInfo.length === 0) {
      console.log('⚠️ Thiếu cột accessible_warehouses. Đang tiến hành thêm vào...');
      await sequelize.query('ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "accessible_warehouses" TEXT');
      console.log('✅ Đã thêm cột accessible_warehouses thành công.');
    } else {
      console.log('✅ Cấu trúc database đã đầy đủ.');
    }

    // Kiểm tra và thêm giá trị 'MANAGER' vào enum_Users_role nếu chưa có
    const enumCheck = await sequelize.query(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid = '\"enum_Users_role\"'::regtype AND enumlabel = 'MANAGER'",
      { type: QueryTypes.SELECT }
    );

    if (enumCheck.length === 0) {
      console.log("⚠️ Thiếu giá trị 'MANAGER' trong enum_Users_role. Đang tiến hành thêm vào...");
      // Note: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some PG versions
      // but sequelize.sync({alter: true}) and our current setup might be fine or we might need to handle it.
      await sequelize.query("ALTER TYPE \"enum_Users_role\" ADD VALUE 'MANAGER'");
      console.log("✅ Đã thêm giá trị 'MANAGER' vào enum_Users_role thành công.");
    }

  } catch (error) {
    console.error('❌ Lỗi khi sửa cấu trúc database:', error.message);
  }
}

module.exports = fixDatabaseSchema;
