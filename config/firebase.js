const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  try {
    const requiredVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required env vars: ${missingVars.join(', ')}`);
    }

    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!privateKey) throw new Error('FIREBASE_PRIVATE_KEY is not defined');

    // Enhanced processing for Vercel/local consistency
    privateKey = privateKey
      .trim()  // Remove leading/trailing whitespace
      .replace(/^"|"$/g, '')  // Strip wrapping quotes if any
      .replace(/\\n/g, '\n')  // Turn literal \n into actual newlines
      .replace(/\\\n/g, '\n');  // Handle escaped newlines (Vercel sometimes adds this)

    // Validate PEM format (basic check)
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Invalid private key format: Missing PEM headers');
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin init failed:', error.message);
    throw error;
  }
} else {
  console.log('ℹ️ Firebase Admin already initialized');
}

module.exports = admin;