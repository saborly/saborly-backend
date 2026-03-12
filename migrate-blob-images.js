/**
 * migrate-blob-images.js
 *
 * One-time migration script to:
 * 1. Find all documents that still reference Vercel Blob image URLs
 * 2. Download each remote image
 * 3. Save it into uploads/images/ with a UUID+timestamp filename
 * 4. Update the document's imageUrl (and any other relevant fields) to the new local URL
 *
 * Usage:
 *   NODE_ENV=development node migrate-blob-images.js
 *
 * Requirements:
 *   - .env must contain:
 *       MONGODB_URI=...
 *       BASE_URL=http://localhost:5000   (or your production API base URL)
 *
 * NOTE: This script is safe to run multiple times; already-migrated URLs (not matching the
 *       BLOB_HOST_PATTERN) will be skipped.
 */

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
require('dotenv').config();

// Import Mongoose models
const Banner = require('./models/Banner');
const { FoodItem, Category } = require('./models/Category');
const Offer = require('./models/offer');
const Setting = require('./models/Setting');

// Directory where local images are stored (must match multer config)
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'images');

// Match any Vercel Blob host – adjust if your project used a specific subdomain
// Example blob URLs:
//   https://abc123.public.blob.vercel-storage.com/restaurant-123.png
const BLOB_HOST_PATTERN = /\.blob\.vercel-storage\.com/;

// Utility to ensure upload dir exists
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Downloads a remote image and saves it to uploads/images with a new filename.
 * Returns the public URL (based on BASE_URL) or null if the download failed.
 */
async function downloadAndStoreImage(remoteUrl) {
  if (!remoteUrl || !BLOB_HOST_PATTERN.test(remoteUrl)) return null;

  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(`⚠️  Failed to download ${remoteUrl} — status ${res.status}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('jpeg')) ext = '.jpg';

    const filename = `${uuidv4()}-${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = await res.buffer();
    fs.writeFileSync(filePath, buffer);

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const publicUrl = `${baseUrl.replace(/\/+$/, '')}/uploads/images/${filename}`;

    console.log(`✅ Downloaded & stored image: ${remoteUrl} -> ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error(`❌ Error downloading ${remoteUrl}:`, err.message);
    return null;
  }
}

/**
 * Generic helper to migrate a single string field on a document.
 */
async function migrateField(doc, fieldPath) {
  const current = fieldPath.split('.').reduce((obj, key) => (obj ? obj[key] : undefined), doc);
  if (!current || typeof current !== 'string' || !BLOB_HOST_PATTERN.test(current)) return false;

  const newUrl = await downloadAndStoreImage(current);
  if (!newUrl) return false;

  // Set nested path (supports dot notation)
  fieldPath.split('.').reduce((obj, key, idx, arr) => {
    if (idx === arr.length - 1) {
      // eslint-disable-next-line no-param-reassign
      obj[key] = newUrl;
    }
    return obj[key];
  }, doc);

  return true;
}

async function migrateBanners() {
  console.log('\n=== Migrating Banner.imageUrl ===');
  const banners = await Banner.find({ imageUrl: { $regex: BLOB_HOST_PATTERN } });
  console.log(`Found ${banners.length} banners referencing Vercel Blob`);

  let updated = 0;
  for (const banner of banners) {
    const changed = await migrateField(banner, 'imageUrl');
    if (changed) {
      await banner.save();
      updated += 1;
    }
  }
  console.log(`Banners updated: ${updated}`);
}

async function migrateCategories() {
  console.log('\n=== Migrating Category.imageUrl ===');
  const categories = await Category.find({ imageUrl: { $regex: BLOB_HOST_PATTERN } });
  console.log(`Found ${categories.length} categories referencing Vercel Blob`);

  let updated = 0;
  for (const category of categories) {
    const changed = await migrateField(category, 'imageUrl');
    if (changed) {
      await category.save();
      updated += 1;
    }
  }
  console.log(`Categories updated: ${updated}`);
}

async function migrateFoodItems() {
  console.log('\n=== Migrating FoodItem.imageUrl and images[].url ===');
  const items = await FoodItem.find({
    $or: [
      { imageUrl: { $regex: BLOB_HOST_PATTERN } },
      { 'images.url': { $regex: BLOB_HOST_PATTERN } },
    ],
  });
  console.log(`Found ${items.length} food items referencing Vercel Blob`);

  let updated = 0;
  for (const item of items) {
    let changed = false;

    // Primary imageUrl
    if (item.imageUrl && BLOB_HOST_PATTERN.test(item.imageUrl)) {
      const newUrl = await downloadAndStoreImage(item.imageUrl);
      if (newUrl) {
        item.imageUrl = newUrl;
        changed = true;
      }
    }

    // Additional images array
    if (Array.isArray(item.images)) {
      for (const img of item.images) {
        if (img.url && BLOB_HOST_PATTERN.test(img.url)) {
          const newUrl = await downloadAndStoreImage(img.url);
          if (newUrl) {
            img.url = newUrl;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await item.save();
      updated += 1;
    }
  }
  console.log(`Food items updated: ${updated}`);
}

async function migrateOffers() {
  console.log('\n=== Migrating Offer.imageUrl ===');
  const offers = await Offer.find({ imageUrl: { $regex: BLOB_HOST_PATTERN } });
  console.log(`Found ${offers.length} offers referencing Vercel Blob`);

  let updated = 0;
  for (const offer of offers) {
    const changed = await migrateField(offer, 'imageUrl');
    if (changed) {
      await offer.save();
      updated += 1;
    }
  }
  console.log(`Offers updated: ${updated}`);
}

async function migrateSettings() {
  console.log('\n=== Migrating Setting.logo & favicon ===');
  const settings = await Setting.find({
    $or: [
      { logo: { $regex: BLOB_HOST_PATTERN } },
      { favicon: { $regex: BLOB_HOST_PATTERN } },
    ],
  });
  console.log(`Found ${settings.length} settings docs referencing Vercel Blob`);

  let updated = 0;
  for (const setting of settings) {
    let changed = false;

    if (setting.logo && BLOB_HOST_PATTERN.test(setting.logo)) {
      const newLogo = await downloadAndStoreImage(setting.logo);
      if (newLogo) {
        setting.logo = newLogo;
        changed = true;
      }
    }

    if (setting.favicon && BLOB_HOST_PATTERN.test(setting.favicon)) {
      const newFav = await downloadAndStoreImage(setting.favicon);
      if (newFav) {
        setting.favicon = newFav;
        changed = true;
      }
    }

    if (changed) {
      await setting.save();
      updated += 1;
    }
  }
  console.log(`Settings updated: ${updated}`);
}

async function main() {
  console.log('🚀 Starting Vercel Blob → local disk image migration...');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  ensureUploadDir();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');

  try {
    await migrateBanners();
    await migrateCategories();
    await migrateFoodItems();
    await migrateOffers();
    await migrateSettings();

    console.log('\n🎉 Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

