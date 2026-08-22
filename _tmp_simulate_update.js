require('dotenv').config();
const mongoose = require('mongoose');
const { Category } = require('./models/Category');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const category = await Category.findOne({ 'name.en': 'Toasts & Savory' });
  console.log('Loaded category:', category.name.en, 'description:', category.description);

  // Simulate a typical frontend submit payload (matches dashoard.jsx CategoryForm formData shape)
  const reqBody = {
    name: { en: 'Toasts & Savory', es: '', ca: '', ar: '', fr: '' },
    description: { en: '', es: '', ca: '', ar: '', fr: '' },
    imageUrl: category.imageUrl,
    icon: category.icon,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
  };

  const updateData = {};
  if (reqBody.name) {
    updateData.name = {
      en: reqBody.name.en || category.name.en,
      es: reqBody.name.es || category.name.es || '',
      ca: reqBody.name.ca || category.name.ca || '',
      ar: reqBody.name.ar || category.name.ar || '',
      fr: reqBody.name.fr || category.name.fr || '',
    };
  }
  if (reqBody.description) {
    const existingDescription = category.description || {};
    updateData.description = {
      en: reqBody.description.en || existingDescription.en || '',
      es: reqBody.description.es || existingDescription.es || '',
      ca: reqBody.description.ca || existingDescription.ca || '',
      ar: reqBody.description.ar || existingDescription.ar || '',
      fr: reqBody.description.fr || existingDescription.fr || '',
    };
  }
  const simpleFields = ['icon', 'imageUrl', 'isActive', 'sortOrder'];
  simpleFields.forEach((field) => {
    if (reqBody[field] !== undefined) updateData[field] = reqBody[field];
  });

  console.log('updateData:', JSON.stringify(updateData, null, 2));

  const updated = await Category.findOneAndUpdate(
    { _id: category._id },
    updateData,
    { new: true, runValidators: true }
  );
  console.log('Updated OK:', updated.name.en, updated.description);

  await mongoose.disconnect();
}
run().catch((e) => { console.error('ERROR:', e); process.exit(1); });
