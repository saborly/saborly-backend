const mongoose = require('mongoose');
require('dotenv').config();

async function listCollections() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listCollections();
