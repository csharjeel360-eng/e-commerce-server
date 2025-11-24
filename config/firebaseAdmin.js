const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

/**
 * Build credential object from environment.
 * Supports three modes (checked in order):
 * 1) FIREBASE_SERVICE_ACCOUNT_JSON - full service account JSON string (escaped allowed)
 * 2) FIREBASE_SERVICE_ACCOUNT_PATH - path to serviceAccountKey.json file
 * 3) Individual env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
function buildServiceAccount() {
  // 1) Full JSON in env
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (err) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  // 2) Path to JSON file
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const p = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (!fs.existsSync(p)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH file not found: ${p}`);
    }
    try {
      const content = fs.readFileSync(p, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to read/parse service account file at ${p}: ${err.message}`);
    }
  }

  // 3) Individual env vars
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    // Support escaped newlines in .env (\n)
    privateKey = privateKey.replace(/\\n/g, '\n');
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey
    };
  }

  throw new Error('No Firebase service account configuration found. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY');
}

const initializeFirebaseAdmin = () => {
  try {
    // Check if Firebase Admin is already initialized
    if (admin.apps.length === 0) {
      const serviceAccount = buildServiceAccount();

      // Basic validation for private_key
      if (!serviceAccount.private_key && !serviceAccount.privateKey && !serviceAccount['private_key']) {
        throw new Error('Service account is missing a private_key');
      }

      // Normalize keys
      const credentialObj = {
        projectId: serviceAccount.project_id || serviceAccount.projectId || process.env.FIREBASE_PROJECT_ID,
        clientEmail: serviceAccount.client_email || serviceAccount.clientEmail || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: serviceAccount.private_key || serviceAccount.privateKey || serviceAccount['private_key']
      };

      // Masked log to help debugging without revealing secret
      const maskedKey = String(credentialObj.privateKey).slice(0, 30).replace(/\n/g, '\\n') + '...';
      console.log('🔐 Initializing Firebase Admin with project:', credentialObj.projectId);
      console.log('🔐 clientEmail:', credentialObj.clientEmail);
      console.log('🔐 privateKey starts with:', maskedKey);

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: credentialObj.projectId,
          clientEmail: credentialObj.clientEmail,
          privateKey: credentialObj.privateKey
        }),
        databaseURL: `https://${credentialObj.projectId}.firebaseio.com`,
        storageBucket: `${credentialObj.projectId}.appspot.com`
      });

      console.log('✅ Firebase Admin SDK initialized successfully');

      // Test Firebase connection
      admin.auth().listUsers(1, 1)
        .then(() => console.log('✅ Firebase Auth connection verified'))
        .catch(err => console.error('❌ Firebase Auth connection failed:', err));
    }

    return admin;
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization error:', error.message || error);
    if (error.stack) console.error(error.stack.split('\n').slice(0,5).join('\n'));
    throw error;
  }
};

module.exports = { initializeFirebaseAdmin, admin };
