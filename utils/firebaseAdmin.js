// utils/firebaseAdmin.js - FIXED VERSION

const admin = require('../config/firebase'); // Adjust path to your Firebase initialization

// ✅ Helper function to ensure all data values are strings
const sanitizeData = (data) => {
  const sanitized = {};
  Object.keys(data).forEach(key => {
    // Firebase requires all data values to be strings
    sanitized[key] = String(data[key]);
  });
  return sanitized;
};

const sendNotificationToDevice = async (fcmToken, title, body, data = {}) => {
  try {
    // ✅ FIXED: Sanitize data to ensure all values are strings
    const sanitizedData = sanitizeData({
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    });

    const message = {
      notification: {
        title,
        body
      },
      data: sanitizedData,
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'order_updates',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      },
      webpush: {
        notification: {
          icon: '/icon.png', // Add your icon path
          badge: '/badge.png', // Add your badge path
          requireInteraction: false
        },
        fcmOptions: {
          link: '/' // Default link when notification is clicked
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Successfully sent notification:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    
    // Provide more detailed error information
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('⚠️ Invalid or expired FCM token');
      return { success: false, error: 'Invalid FCM token', code: error.code };
    }
    
    return { success: false, error: error.message, code: error.code };
  }
};

// Send notification to multiple devices
const sendNotificationToMultipleDevices = async (fcmTokens, title, body, data = {}) => {
  try {
    if (!Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      return { success: false, message: 'No tokens provided' };
    }

    // ✅ FIXED: Sanitize data to ensure all values are strings
    const sanitizedData = sanitizeData({
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    });

    const message = {
      notification: {
        title,
        body
      },
      data: sanitizedData,
      tokens: fcmTokens, // Use 'tokens' not 'token' for multiple devices
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'order_updates',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      },
      webpush: {
        notification: {
          icon: '/icon.png',
          badge: '/badge.png',
          requireInteraction: false
        },
        fcmOptions: {
          link: '/'
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Successfully sent ${response.successCount} notifications`);
    console.log(`❌ Failed to send ${response.failureCount} notifications`);
    
    // Log individual failures
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed for token ${idx}:`, resp.error);
        }
      });
    }
    
    return { 
      success: true, 
      response,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    return { success: false, error: error.message };
  }
};

// Send notification to topic
const sendNotificationToTopic = async (topic, title, body, data = {}) => {
  try {
    // ✅ FIXED: Sanitize data to ensure all values are strings
    const sanitizedData = sanitizeData({
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    });

    const message = {
      notification: {
        title,
        body
      },
      data: sanitizedData,
      topic,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'order_updates',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            category: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      },
      webpush: {
        notification: {
          icon: '/icon.png',
          badge: '/badge.png',
          requireInteraction: false
        },
        fcmOptions: {
          link: '/'
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Successfully sent notification to topic:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Error sending notification to topic:', error);
    return { success: false, error: error.message };
  }
};

// Subscribe user to topic
const subscribeToTopic = async (fcmTokens, topic) => {
  try {
    const tokens = Array.isArray(fcmTokens) ? fcmTokens : [fcmTokens];
    const response = await admin.messaging().subscribeToTopic(tokens, topic);
    console.log('✅ Successfully subscribed to topic:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Error subscribing to topic:', error);
    return { success: false, error: error.message };
  }
};

// Unsubscribe user from topic
const unsubscribeFromTopic = async (fcmTokens, topic) => {
  try {
    const tokens = Array.isArray(fcmTokens) ? fcmTokens : [fcmTokens];
    const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
    console.log('✅ Successfully unsubscribed from topic:', response);
    return { success: true, response };
  } catch (error) {
    console.error('❌ Error unsubscribing from topic:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendNotificationToDevice,
  sendNotificationToMultipleDevices,
  sendNotificationToTopic,
  subscribeToTopic,
  unsubscribeFromTopic
};