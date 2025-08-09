/**
 * Admin Secret Codes Setup Script
 * 
 * This script:
 * 1. Generates 10 random 6-digit secret codes
 * 2. Updates the .env file with all codes
 * 3. Displays the generated codes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Setup dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Generate a random 6-digit code
 * @returns {String} 6-digit code
 */
const generateRandomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate 10 random admin secret codes
 * @returns {Array} Generated codes
 */
const generateSecretCodes = () => {
    // Generate 10 new codes
    const codes = [];
    for (let i = 0; i < 10; i++) {
        const code = generateRandomCode();
        codes.push(code);
    }
    
    console.log(`Generated ${codes.length} admin secret codes.`);
    return codes;
};

/**
 * Update the .env file with all codes
 * @param {Array} codes - Array of generated codes
 */
const updateEnvFile = (codes) => {
    try {
        const envPath = path.resolve(__dirname, '../../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Set the first code as the default ADMIN_SECRET_CODE
        if (envContent.includes('ADMIN_SECRET_CODE=')) {
            // Replace existing value
            envContent = envContent.replace(
                /ADMIN_SECRET_CODE=.*/,
                `ADMIN_SECRET_CODE=${codes[0]}`
            );
        } else {
            // Add new variable
            envContent += `\n# Admin Secret Codes\nADMIN_SECRET_CODE=${codes[0]}\n`;
        }
        
        // Add all codes as ADMIN_SECRET_CODES array
        if (envContent.includes('ADMIN_SECRET_CODES=')) {
            // Replace existing value
            envContent = envContent.replace(
                /ADMIN_SECRET_CODES=.*/,
                `ADMIN_SECRET_CODES=${JSON.stringify(codes)}`
            );
        } else {
            // Add new variable
            envContent += `ADMIN_SECRET_CODES=${JSON.stringify(codes)}\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log(`Updated .env file with default admin secret code: ${codes[0]}`);
        console.log(`Added all ${codes.length} codes to .env file as ADMIN_SECRET_CODES`);
    } catch (error) {
        console.error('Error updating .env file:', error);
        throw error;
    }
};

/**
 * Main function to run the setup
 */
const setupAdminSecretCodes = () => {
    try {
        console.log('Setting up admin secret codes...');
        
        // Generate codes
        const codes = generateSecretCodes();
        
        // Update .env with all codes
        updateEnvFile(codes);
        
        console.log('Admin secret codes setup complete!');
        console.log('Generated codes:');
        codes.forEach((code, index) => {
            console.log(`${index + 1}. ${code}`);
        });
        
        return codes;
    } catch (error) {
        console.error('Error setting up admin secret codes:', error);
    }
};

// Run the setup
setupAdminSecretCodes();
