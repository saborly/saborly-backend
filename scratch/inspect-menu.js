require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem, Category } = require('../models/Category');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const branches = await Branch.find({});
  for (const b of branches) {
    console.log('BRANCH', b._id.toString(), b.name);
    const cats = await Category.find({ branchId: b._id });
    console.log('  categories:', cats.map(c => `${c.name?.en || c.name} (${c._id})`).join(' | '));
    const items = await FoodItem.find({ branchId: b._id }).select('name price sku category');
    console.log('  items count:', items.length);
    items.forEach(i => console.log('    -', i.name?.en, '|', i.price, '|', i.sku, '|', i.category));
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
