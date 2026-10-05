require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const { FoodItem, Category } = require('../models/Category');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const branches = await Branch.find({}).lean();
  const out = [];
  for (const b of branches) {
    const cats = await Category.find({ branchId: b._id }).lean();
    const items = await FoodItem.find({ branchId: b._id }).lean();
    out.push({ branch: { _id: b._id, name: b.name, location: b.location, isActive: b.isActive }, categories: cats.map(c => ({ _id: c._id, name: c.name, isActive: c.isActive, sortOrder: c.sortOrder })), items: items.map(i => ({ _id: i._id, sku: i.sku, name: i.name, category: i.category, price: i.price, originalPrice: i.originalPrice, isActive: i.isActive, isAvailable: i.isAvailable, mealSizes: i.mealSizes, extras: i.extras, addons: i.addons })) });
  }
  require('fs').writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(out.map(o => `${o.branch.name} ${o.branch._id} cats=${o.categories.length} items=${o.items.length}`).join('\n'));
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
