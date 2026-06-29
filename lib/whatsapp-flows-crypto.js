const crypto = require('crypto');
const fs = require('fs');

/**
 * Gets the configured RSA private key for WhatsApp Flows.
 */
function getPrivateKey() {
    if (process.env.WHATSAPP_FLOWS_PRIVATE_KEY) {
        return process.env.WHATSAPP_FLOWS_PRIVATE_KEY;
    }
    if (process.env.WHATSAPP_FLOWS_PRIVATE_KEY_PATH && fs.existsSync(process.env.WHATSAPP_FLOWS_PRIVATE_KEY_PATH)) {
        return fs.readFileSync(process.env.WHATSAPP_FLOWS_PRIVATE_KEY_PATH, 'utf8');
    }
    const localPath = 'config/whatsapp-flows-private.pem';
    if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath, 'utf8');
    }
    const rootPath = 'private.pem';
    if (fs.existsSync(rootPath)) {
        return fs.readFileSync(rootPath, 'utf8');
    }
    return null;
}

/**
 * Decrypts the request payload sent by Meta.
 */
function decryptRequest(body) {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body || {};
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
        throw new Error('Missing required encryption parameters in request body');
    }

    const privateKey = getPrivateKey();
    if (!privateKey) {
        throw new Error('WhatsApp Flows private key is not configured on the server. Set WHATSAPP_FLOWS_PRIVATE_KEY.');
    }

    // 1. Decrypt the symmetric AES key using the RSA private key
    const encryptedAesKeyBuf = Buffer.from(encrypted_aes_key, 'base64');
    const aesKeyBuf = crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        encryptedAesKeyBuf
    );

    // 2. Decode initialization vector and ciphertext
    const iv = Buffer.from(initial_vector, 'base64');
    const flowDataBuf = Buffer.from(encrypted_flow_data, 'base64');
    
    // GCM authentication tag is the last 16 bytes
    const tag = flowDataBuf.slice(-16);
    const ciphertext = flowDataBuf.slice(0, -16);

    // 3. Decrypt the payload using AES-GCM
    const algo = aesKeyBuf.length === 32 ? 'aes-256-gcm' : 'aes-128-gcm';
    const decipher = crypto.createDecipheriv(algo, aesKeyBuf, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
    decrypted += decipher.final('utf8');

    return {
        decrypted: JSON.parse(decrypted),
        aesKey: aesKeyBuf,
        algo
    };
}

/**
 * Encrypts the response payload using the same symmetric key.
 */
function encryptResponse(payload, aesKey, algo) {
    const responseIv = crypto.randomBytes(12); // GCM standard 12-byte IV
    const cipher = crypto.createCipheriv(algo, aesKey, responseIv);
    
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'binary');
    encrypted += cipher.final('binary');
    
    const authTag = cipher.getAuthTag();
    const cipherWithTag = Buffer.concat([Buffer.from(encrypted, 'binary'), authTag]);

    return {
        encrypted_flow_data: cipherWithTag.toString('base64'),
        initial_vector: responseIv.toString('base64'),
        status: 'SUCCESS'
    };
}

module.exports = {
    decryptRequest,
    encryptResponse,
    getPrivateKey
};
