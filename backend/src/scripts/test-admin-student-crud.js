/**
 * Test script for admin student CRUD operations
 * This script tests the creation and deletion of students via the admin API
 */
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Base URL for API calls
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

// Admin credentials
let adminToken = '';

// Test student data
const testStudents = [
    {
        fullName: 'Test Student 1',
        admissionNumber: 'ADM001',
        age: 15,
        gender: 'Male',
        bio: 'Test student for API testing'
    },
    {
        fullName: 'Test Student 2',
        admissionNumber: 'ADM002',
        age: 16,
        gender: 'Female',
        bio: 'Another test student for API testing'
    },
    {
        fullName: 'Test Student 3',
        admissionNumber: 'ADM003',
        age: 17,
        gender: 'Male',
        bio: 'Third test student for API testing'
    }
];

/**
 * Login as admin
 * @param {string} email - Admin email
 * @param {string} password - Admin password
 * @returns {Promise<string>} - Admin token
 */
async function loginAsAdmin(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Login failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Admin login successful');
        return data.token;
    } catch (error) {
        console.error('❌ Admin login failed:', error.message);
        process.exit(1);
    }
}

/**
 * Create a student
 * @param {Object} studentData - Student data
 * @returns {Promise<Object>} - Created student
 */
async function createStudent(studentData) {
    try {
        const response = await fetch(`${API_BASE_URL}/students`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(studentData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Create student failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Created student: ${studentData.fullName} (${studentData.admissionNumber})`);
        return data.student;
    } catch (error) {
        console.error(`❌ Failed to create student ${studentData.fullName}:`, error.message);
        return null;
    }
}

/**
 * Get all students
 * @returns {Promise<Array>} - List of students
 */
async function getAllStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/students`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Get students failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Retrieved ${data.students.length} students`);
        return data.students;
    } catch (error) {
        console.error('❌ Failed to get students:', error.message);
        return [];
    }
}

/**
 * Delete all students
 * @returns {Promise<boolean>} - Success status
 */
async function deleteAllStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/students/delete-all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Delete all students failed: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Deleted all students: ${data.count} records removed`);
        return true;
    } catch (error) {
        console.error('❌ Failed to delete all students:', error.message);
        return false;
    }
}

/**
 * Run the test script
 */
async function runTest() {
    try {
        // Prompt for admin credentials
        rl.question('Enter admin email: ', async (email) => {
            rl.question('Enter admin password: ', async (password) => {
                try {
                    // Login as admin
                    adminToken = await loginAsAdmin(email, password);
                    
                    // Get initial student count
                    const initialStudents = await getAllStudents();
                    console.log(`Initial student count: ${initialStudents.length}`);
                    
                    // Ask if user wants to delete all students first
                    rl.question('Do you want to delete all existing students first? (y/n): ', async (answer) => {
                        if (answer.toLowerCase() === 'y') {
                            await deleteAllStudents();
                        }
                        
                        // Create test students
                        console.log('\n--- Creating test students ---');
                        for (const studentData of testStudents) {
                            await createStudent(studentData);
                        }
                        
                        // Get final student count
                        const finalStudents = await getAllStudents();
                        console.log(`\nFinal student count: ${finalStudents.length}`);
                        
                        if (finalStudents.length > 0) {
                            console.log('\nStudent list:');
                            finalStudents.forEach((student, index) => {
                                console.log(`${index + 1}. ${student.fullName} (${student.admissionNumber})`);
                            });
                        }
                        
                        console.log('\n✅ Test completed successfully');
                        rl.close();
                    });
                } catch (error) {
                    console.error('❌ Test failed:', error.message);
                    rl.close();
                }
            });
        });
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        rl.close();
    }
}

// Run the test
runTest();
