const sequelize = require('../src/config/database');
const RetailSale = require('../src/models/RetailSale');

async function migrateGender() {
    try {
        await sequelize.authenticate();
        console.log('Connected to DB...');

        // Since the ENUM changed, we might need to manually update if sync {alter: true} has already run
        // Or run it now if we want to be safe.
        
        console.log('Migrating gender values...');
        
        // Update Trai -> Nam
        const [traiCount] = await sequelize.query("UPDATE \"RetailSales\" SET gender = 'Nam' WHERE gender = 'Trai'");
        console.log(`Updated 'Trai' to 'Nam'`);

        // Update Gái -> Nữ
        const [gaiCount] = await sequelize.query("UPDATE \"RetailSales\" SET gender = 'Nữ' WHERE gender = 'Gái'");
        console.log(`Updated 'Gái' to 'Nữ'`);

        console.log('Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateGender();
