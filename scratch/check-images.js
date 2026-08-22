require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem } = require('../models/Category');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const branches = await Branch.find({});
  for (const b of branches) {
    const total = await FoodItem.countDocuments({ branchId: b._id });
    const placeholder = await FoodItem.countDocuments({ branchId: b._id, imageUrl: { $regex: 'placehold.co' } });
    console.log(b.name, '-> total:', total, ', placeholder image:', placeholder, ', real image:', total - placeholder);
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
