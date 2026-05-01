/**
 * Seeds default + Sabadell branches and attaches branchId to legacy documents.
 * Run: node seed-branches.js  (from saborly-backend, with MONGODB_URI in .env)
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Branch = require('./models/Branch');

const BARCELONA = {
  name: 'Saborly — Main (Barcelona)',
  phone: '+34932112072',
  location: 'Barcelona, Spain',
  address: 'Saborly, C/ de Pere IV, 208, Sant Martí, 08005 Barcelona, Spain',
  latitude: 41.405,
  longitude: 2.2009,
};

const SABADELL = {
  name: 'Saborly — Sabadell',
  phone: '+34930000000',
  location: 'Sabadell, Spain',
  address: 'Sabadell, Vallès Occidental, Spain',
  latitude: 41.5433,
  longitude: 2.1093,
};

async function findOrCreateBranch(def) {
  let doc = await Branch.findOne({
    $or: [{ name: def.name }, { phone: def.phone }],
  });
  if (!doc) {
    doc = await Branch.create({
      name: def.name,
      location: def.location,
      address: def.address,
      phone: def.phone,
      currency: 'EUR',
      language: 'es',
      timezone: 'Europe/Madrid',
      isActive: true,
      ...(def.latitude != null && def.longitude != null
        ? { latitude: def.latitude, longitude: def.longitude }
        : {}),
    });
    console.log('Created branch:', def.name, doc._id.toString());
  } else if (def.latitude != null && def.longitude != null) {
    const needsCoords = doc.latitude == null || doc.longitude == null;
    if (needsCoords) {
      await Branch.updateOne(
        { _id: doc._id },
        { $set: { latitude: def.latitude, longitude: def.longitude } }
      );
      doc = await Branch.findById(doc._id);
      console.log('Updated coordinates for:', def.name);
    }
  }
  return doc;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const defaultBranch = await findOrCreateBranch(BARCELONA);
  await findOrCreateBranch(SABADELL);

  const defaultId = defaultBranch._id;

  // offers: unique (branchId, couponCode) — null/missing couponCode would collide for one branch
  try {
    const cursor = db.collection('offers').find({
      $or: [{ branchId: { $exists: false } }, { branchId: null }],
    });
    let offerUpdates = 0;
    for await (const o of cursor) {
      const set = { branchId: defaultId };
      const code = o.couponCode;
      if (code == null || String(code).trim() === '') {
        set.couponCode = `AUTO${o._id.toString()}`.toUpperCase();
      }
      await db.collection('offers').updateOne({ _id: o._id }, { $set: set });
      offerUpdates += 1;
    }
    if (offerUpdates) console.log(`offers: updated ${offerUpdates} documents with branchId`);
  } catch (e) {
    console.warn('offers migration:', e.message);
  }

  const collections = [
    'users',
    'categories',
    'fooditems',
    'banners',
    'contacts',
    'addresses',
    'settings',
  ];

  for (const name of collections) {
    try {
      const r = await db.collection(name).updateMany(
        { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
        { $set: { branchId: defaultId } }
      );
      if (r.modifiedCount) console.log(`${name}: updated ${r.modifiedCount} documents with branchId`);
    } catch (e) {
      console.warn(`Skip ${name}:`, e.message);
    }
  }

  try {
    await db.collection('orders').updateMany(
      { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
      { $set: { branchId: defaultId } }
    );
  } catch (e) {
    console.warn('orders migration:', e.message);
  }

  try {
    await db.collection('users').dropIndex('email_1');
    console.log('Dropped legacy users email_1 index');
  } catch (e) {
    /* ignore */
  }

  try {
    await db.collection('users').createIndex({ email: 1, branchId: 1 }, { unique: true });
    console.log('Created compound unique index on users (email, branchId)');
  } catch (e) {
    console.warn('users index:', e.message);
  }

  console.log('Done. Default branchId:', defaultId.toString());
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
