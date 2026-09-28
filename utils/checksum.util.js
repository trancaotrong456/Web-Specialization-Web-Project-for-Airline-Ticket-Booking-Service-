const crypto = require('crypto');

/**
 * Sort object alphabetically by key
 */
const sortObject = (obj) => {
  const sorted = {};
  const str = [];
  let key;
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
};

/**
 * Sign VNPay parameters with HMAC-SHA512
 * Follows VNPay official Node.js documentation:
 * 1. Remove vnp_SecureHash & vnp_SecureHashType & empty values
 * 2. Sort keys alphabetically with URI encoding
 * 3. Join with & and hash using HMAC-SHA512
 * @param {object} params
 * @param {string} secretKey
 * @returns {string} hash
 */
const signVnpayParams = (params, secretKey) => {
  const cleanParams = {};
  for (const key of Object.keys(params)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== 'vnp_securehash' &&
      lowerKey !== 'vnp_securehashtype' &&
      params[key] !== '' &&
      params[key] !== null &&
      params[key] !== undefined
    ) {
      cleanParams[key] = params[key];
    }
  }

  const sorted = sortObject(cleanParams);
  const signData = [];
  for (const key of Object.keys(sorted)) {
    signData.push(`${key}=${sorted[key]}`);
  }

  const queryString = signData.join('&');
  const hmac = crypto.createHmac('sha512', secretKey);
  return hmac.update(Buffer.from(queryString, 'utf-8')).digest('hex');
};

/**
 * Verify VNPay SecureHash
 * @param {object} params - query object from VNPay IPN or return URL
 * @param {string} secretKey
 * @returns {boolean}
 */
const verifyVnpayChecksum = (params, secretKey) => {
  const secureHash = params['vnp_SecureHash'] || params['vnp_securehash'];
  if (!secureHash) return false;

  const calculatedHash = signVnpayParams(params, secretKey);
  return calculatedHash.toLowerCase() === secureHash.toLowerCase();
};

module.exports = {
  sortObject,
  signVnpayParams,
  verifyVnpayChecksum,
};
