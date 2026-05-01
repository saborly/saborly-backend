/**
 * Clone content data from Barcelona branch into Sabadell branch.
 * Run: node clone-branch-data.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Branch = require('./models/Branch');

function toObjectId(value) {
  return new mongoose.Types.ObjectId(value);
}

function stripMeta(doc) {
  const clone = { ...doc };
  delete clone._id;
  delete clone.__v;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone;
}

async function cloneCategories(db, sourceBranchId, targetBranchId) {
  const source = await db.collection('categories').find({ branchId: sourceBranchId }).toArray();
  const target = await db.collection('categories').find({ branchId: targetBranchId }).toArray();

  await db.collection('categories').deleteMany({ branchId: targetBranchId });

  const categoryIdMap = new Map();
  if (source.length === 0) return { categoryIdMap, count: 0 };

  const docs = source.map((doc) => {
    const newId = new mongoose.Types.ObjectId();
    categoryIdMap.set(doc._id.toString(), newId);
    return {
      ...stripMeta(doc),
      _id: newId,
      branchId: targetBranchId,
    };
  });

  await db.collection('categories').insertMany(docs);
  return { categoryIdMap, count: docs.length, replaced: target.length };
}

async function cloneFoodItems(db, sourceBranchId, targetBranchId, categoryIdMap) {
  const source = await db.collection('fooditems').find({ branchId: sourceBranchId }).toArray();
  const target = await db.collection('fooditems').find({ branchId: targetBranchId }).toArray();

  await db.collection('fooditems').deleteMany({ branchId: targetBranchId });

  const foodItemIdMap = new Map();
  if (source.length === 0) return { foodItemIdMap, count: 0 };

  const docs = source.map((doc) => {
    const newId = new mongoose.Types.ObjectId();
    foodItemIdMap.set(doc._id.toString(), newId);
    const mappedCategory = doc.category ? categoryIdMap.get(doc.category.toString()) : null;
    return {
      ...stripMeta(doc),
      _id: newId,
      branchId: targetBranchId,
      category: mappedCategory || doc.category,
    };
  });

  await db.collection('fooditems').insertMany(docs);
  return { foodItemIdMap, count: docs.length, replaced: target.length };
}

function remapObjectIdArray(arr, idMap) {
  if (!Array.isArray(arr)) return [];
  return arr.map((id) => idMap.get(id.toString()) || id);
}

async function cloneOffers(db, sourceBranchId, targetBranchId, categoryIdMap, foodItemIdMap) {
  const source = await db.collection('offers').find({ branchId: sourceBranchId }).toArray();
  const target = await db.collection('offers').find({ branchId: targetBranchId }).toArray();

  await db.collection('offers').deleteMany({ branchId: targetBranchId });
  if (source.length === 0) return { count: 0, replaced: target.length };

  const docs = source.map((doc) => {
    const cloned = {
      ...stripMeta(doc),
      _id: new mongoose.Types.ObjectId(),
      branchId: targetBranchId,
      appliedToCategories: remapObjectIdArray(doc.appliedToCategories, categoryIdMap),
      appliedToItems: remapObjectIdArray(doc.appliedToItems, foodItemIdMap),
      excludedItems: remapObjectIdArray(doc.excludedItems, foodItemIdMap),
      comboItems: Array.isArray(doc.comboItems)
        ? doc.comboItems.map((x) => ({
            ...x,
            foodItem: foodItemIdMap.get(x.foodItem?.toString()) || x.foodItem,
          }))
        : [],
      branches: [targetBranchId],
      usageCount: 0,
      usageHistory: [],
      claimedDevices: [],
    };

    return cloned;
  });

  await db.collection('offers').insertMany(docs);
  return { count: docs.length, replaced: target.length };
}

async function cloneBanners(db, sourceBranchId, targetBranchId) {
  const source = await db.collection('banners').find({ branchId: sourceBranchId }).toArray();
  const target = await db.collection('banners').find({ branchId: targetBranchId }).toArray();

  await db.collection('banners').deleteMany({ branchId: targetBranchId });
  if (source.length === 0) return { count: 0, replaced: target.length };

  const docs = source.map((doc) => ({
    ...stripMeta(doc),
    _id: new mongoose.Types.ObjectId(),
    branchId: targetBranchId,
  }));

  await db.collection('banners').insertMany(docs);
  return { count: docs.length, replaced: target.length };
}

async function cloneSettings(db, sourceBranchId, targetBranchId) {
  const source = await db.collection('settings').findOne({ branchId: sourceBranchId });
  if (!source) return { copied: false };

  const targetDoc = {
    ...stripMeta(source),
    _id: new mongoose.Types.ObjectId(),
    branchId: targetBranchId,
  };

  await db.collection('settings').deleteMany({ branchId: targetBranchId });
  await db.collection('settings').insertOne(targetDoc);
  return { copied: true };
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const sourceBranch = await Branch.findOne({
    $or: [{ name: /barcelona/i }, { name: /saborly_main/i }, { phone: '+34932112072' }],
  }).lean();
  const targetBranch = await Branch.findOne({ name: /sabadell/i }).lean();

  if (!sourceBranch) throw new Error('Barcelona branch not found');
  if (!targetBranch) throw new Error('Sabadell branch not found');

  const sourceBranchId = toObjectId(sourceBranch._id);
  const targetBranchId = toObjectId(targetBranch._id);

  const { categoryIdMap, count: categoryCount, replaced: categoryReplaced } = await cloneCategories(
    db,
    sourceBranchId,
    targetBranchId
  );
  const { foodItemIdMap, count: foodItemCount, replaced: foodItemReplaced } = await cloneFoodItems(
    db,
    sourceBranchId,
    targetBranchId,
    categoryIdMap
  );
  const { count: offerCount, replaced: offerReplaced } = await cloneOffers(
    db,
    sourceBranchId,
    targetBranchId,
    categoryIdMap,
    foodItemIdMap
  );
  const { count: bannerCount, replaced: bannerReplaced } = await cloneBanners(
    db,
    sourceBranchId,
    targetBranchId
  );
  const { copied: settingsCopied } = await cloneSettings(db, sourceBranchId, targetBranchId);

  console.log('Clone complete:');
  console.log(`- Categories: ${categoryCount} inserted (${categoryReplaced || 0} replaced)`);
  console.log(`- Food items: ${foodItemCount} inserted (${foodItemReplaced || 0} replaced)`);
  console.log(`- Offers: ${offerCount} inserted (${offerReplaced || 0} replaced)`);
  console.log(`- Banners: ${bannerCount} inserted (${bannerReplaced || 0} replaced)`);
  console.log(`- Settings copied: ${settingsCopied ? 'yes' : 'no'}`);
  console.log(`Source: ${sourceBranch.name}`);
  console.log(`Target: ${targetBranch.name}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('Clone failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (e) {
    // ignore disconnect errors during failure handling
  }
  process.exit(1);
});
