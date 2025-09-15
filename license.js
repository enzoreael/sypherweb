// License Manager - Client-side license management
const LicenseManager = (function() {
  // Database name and version
  const DB_NAME = 'SypherLicenseDB';
  const DB_VERSION = 1;
  
  // Store names
  const STORE_LICENSES = 'licenses';
  const STORE_DEVICES = 'devices';
  
  let db = null;
  
  // Initialize the database
  function initDB() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }
      
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = function(event) {
        reject(new Error('Database error: ' + event.target.errorCode));
      };
      
      request.onsuccess = function(event) {
        db = event.target.result;
        resolve(db);
      };
      
      request.onupgradeneeded = function(event) {
        const db = event.target.result;
        
        // Create licenses store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_LICENSES)) {
          const licenseStore = db.createObjectStore(STORE_LICENSES, { keyPath: 'key' });
          licenseStore.createIndex('status', 'status', { unique: false });
          licenseStore.createIndex('deviceId', 'deviceId', { unique: false });
          licenseStore.createIndex('activationDate', 'activationDate', { unique: false });
        }
        
        // Create devices store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_DEVICES)) {
          const deviceStore = db.createObjectStore(STORE_DEVICES, { keyPath: 'id' });
          deviceStore.createIndex('licenseKey', 'licenseKey', { unique: true });
        }
      };
    });
  }
  
  // Generate a device fingerprint
  function generateDeviceId() {
    // Get browser and device information
    const navigatorInfo = navigator.userAgent + navigator.language + navigator.hardwareConcurrency;
    const screenInfo = screen.width + screen.height + screen.colorDepth;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Create a hash of the device information
    let hash = 0;
    const str = navigatorInfo + screenInfo + timezone;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return 'device_' + Math.abs(hash).toString(16);
  }
  
  // Generate a license key
  function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return key;
  }
  
  // Get current device ID (generate if not exists)
  function getDeviceId() {
    let deviceId = localStorage.getItem('sypher-device-id');
    
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem('sypher-device-id', deviceId);
    }
    
    return deviceId;
  }
  
  // Get a license by key
  function getLicense(key) {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readonly');
          const store = transaction.objectStore(STORE_LICENSES);
          const request = store.get(key);
          
          request.onerror = function(event) {
            reject(new Error('Error getting license: ' + event.target.errorCode));
          };
          
          request.onsuccess = function(event) {
            resolve(event.target.result);
          };
        })
        .catch(reject);
    });
  }
  
  // Get all licenses
  function getAllLicenses() {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readonly');
          const store = transaction.objectStore(STORE_LICENSES);
          const request = store.getAll();
          
          request.onerror = function(event) {
            reject(new Error('Error getting licenses: ' + event.target.errorCode));
          };
          
          request.onsuccess = function(event) {
            resolve(event.target.result);
          };
        })
        .catch(reject);
    });
  }
  
  // Create a new license
  function createLicense(key) {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readwrite');
          const store = transaction.objectStore(STORE_LICENSES);
          
          const license = {
            key: key,
            status: 'inactive',
            createdAt: new Date().toISOString(),
            activationDate: null,
            deviceId: null,
            lastActive: null
          };
          
          const request = store.add(license);
          
          request.onerror = function(event) {
            // If license already exists, resolve anyway
            if (event.target.error.name === 'ConstraintError') {
              resolve(license);
            } else {
              reject(new Error('Error creating license: ' + event.target.errorCode));
            }
          };
          
          request.onsuccess = function(event) {
            resolve(license);
          };
        })
        .catch(reject);
    });
  }
  
  // Update license status
  function updateLicenseStatus(key, status) {
    return new Promise((resolve, reject) => {
      getLicense(key)
        .then(license => {
          if (!license) {
            reject(new Error('License not found'));
            return;
          }
          
          license.status = status;
          
          // If deactivating, remove device association
          if (status === 'inactive') {
            license.deviceId = null;
            license.activationDate = null;
          }
          
          initDB()
            .then(db => {
              const transaction = db.transaction([STORE_LICENSES], 'readwrite');
              const store = transaction.objectStore(STORE_LICENSES);
              const request = store.put(license);
              
              request.onerror = function(event) {
                reject(new Error('Error updating license: ' + event.target.errorCode));
              };
              
              request.onsuccess = function(event) {
                resolve(license);
              };
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }
  
  // Delete a license
  function deleteLicense(key) {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readwrite');
          const store = transaction.objectStore(STORE_LICENSES);
          const request = store.delete(key);
          
          request.onerror = function(event) {
            reject(new Error('Error deleting license: ' + event.target.errorCode));
          };
          
          request.onsuccess = function(event) {
            resolve();
          };
        })
        .catch(reject);
    });
  }
  
  // Activate a license for the current device
  function activateLicense(key) {
    return new Promise((resolve, reject) => {
      const deviceId = getDeviceId();
      
      getLicense(key)
        .then(license => {
          if (!license) {
            reject(new Error('License not found'));
            return;
          }
          
          if (license.status !== 'inactive') {
            if (license.deviceId === deviceId) {
              resolve({ 
                success: true, 
                message: 'License already activated on this device',
                license: license
              });
            } else {
              reject(new Error('License is already in use on another device'));
            }
            return;
          }
          
          // Update license
          license.status = 'active';
          license.deviceId = deviceId;
          license.activationDate = new Date().toISOString();
          license.lastActive = new Date().toISOString();
          
          initDB()
            .then(db => {
              const transaction = db.transaction([STORE_LICENSES], 'readwrite');
              const store = transaction.objectStore(STORE_LICENSES);
              const request = store.put(license);
              
              request.onerror = function(event) {
                reject(new Error('Error activating license: ' + event.target.errorCode));
              };
              
              request.onsuccess = function(event) {
                // Store device-license association in localStorage as fallback
                localStorage.setItem('sypher-license-key', key);
                
                resolve({ 
                  success: true, 
                  message: 'License activated successfully',
                  license: license
                });
              };
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }
  
  // Deactivate a license from the current device
  function deactivateLicense() {
    return new Promise((resolve, reject) => {
      const deviceId = getDeviceId();
      const licenseKey = localStorage.getItem('sypher-license-key');
      
      if (!licenseKey) {
        resolve({ success: true, message: 'No active license found' });
        return;
      }
      
      getLicense(licenseKey)
        .then(license => {
          if (!license || license.deviceId !== deviceId) {
            localStorage.removeItem('sypher-license-key');
            resolve({ success: true, message: 'License not associated with this device' });
            return;
          }
          
          // Update license
          license.status = 'inactive';
          license.deviceId = null;
          license.activationDate = null;
          license.lastActive = new Date().toISOString();
          
          initDB()
            .then(db => {
              const transaction = db.transaction([STORE_LICENSES], 'readwrite');
              const store = transaction.objectStore(STORE_LICENSES);
              const request = store.put(license);
              
              request.onerror = function(event) {
                reject(new Error('Error deactivating license: ' + event.target.errorCode));
              };
              
              request.onsuccess = function(event) {
                localStorage.removeItem('sypher-license-key');
                resolve({ 
                  success: true, 
                  message: 'License deactivated successfully',
                  license: license
                });
              };
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }
  
  // Get the current device's license
  function getDeviceLicense() {
    return new Promise((resolve, reject) => {
      const deviceId = getDeviceId();
      const licenseKey = localStorage.getItem('sypher-license-key');
      
      if (!licenseKey) {
        resolve(null);
        return;
      }
      
      getLicense(licenseKey)
        .then(license => {
          if (license && license.deviceId === deviceId && license.status === 'active') {
            resolve(license);
          } else {
            localStorage.removeItem('sypher-license-key');
            resolve(null);
          }
        })
        .catch(reject);
    });
  }
  
  // Export all data
  function exportData() {
    return new Promise((resolve, reject) => {
      getAllLicenses()
        .then(licenses => {
          resolve({
            exportDate: new Date().toISOString(),
            version: DB_VERSION,
            licenses: licenses
          });
        })
        .catch(reject);
    });
  }
  
  // Import data
  function importData(data) {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readwrite');
          const store = transaction.objectStore(STORE_LICENSES);
          
          // Clear existing data
          store.clear();
          
          // Add imported licenses
          if (data.licenses && Array.isArray(data.licenses)) {
            data.licenses.forEach(license => {
              store.add(license);
            });
          }
          
          transaction.oncomplete = function() {
            resolve();
          };
          
          transaction.onerror = function(event) {
            reject(new Error('Error importing data: ' + event.target.errorCode));
          };
        })
        .catch(reject);
    });
  }
  
  // Clear all data
  function clearAllData() {
    return new Promise((resolve, reject) => {
      initDB()
        .then(db => {
          const transaction = db.transaction([STORE_LICENSES], 'readwrite');
          const store = transaction.objectStore(STORE_LICENSES);
          
          store.clear();
          
          transaction.oncomplete = function() {
            resolve();
          };
          
          transaction.onerror = function(event) {
            reject(new Error('Error clearing data: ' + event.target.errorCode));
          };
        })
        .catch(reject);
    });
  }
  
  // Check if the current device is licensed
  function isDeviceLicensed() {
    return new Promise((resolve, reject) => {
      getDeviceLicense()
        .then(license => {
          resolve(!!license);
        })
        .catch(reject);
    });
  }
  
  // Public API
  return {
    initDB,
    generateLicenseKey,
    getLicense,
    getAllLicenses,
    createLicense,
    updateLicenseStatus,
    deleteLicense,
    activateLicense,
    deactivateLicense,
    getDeviceLicense,
    isDeviceLicensed,
    exportData,
    importData,
    clearAllData
  };
})();

// Initialize the database when the script loads
LicenseManager.initDB().catch(console.error);