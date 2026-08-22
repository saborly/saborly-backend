require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem } = require('../models/Category');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const branches = await Branch.find({});
  for (const b of branches) {
    console.log('Branch:', b.name);
    const items = await FoodItem.find({ branchId: b._id, 'name.en': { $regex: 'Cortado', $options: 'i' } });
    items.forEach(i => console.log('  ', i._id.toString(), '|', i.name.en, '|', i.price, '|', i.sku));
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
