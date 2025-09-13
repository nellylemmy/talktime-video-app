#!/usr/bin/env node

/**
 * Test script to verify student availability functionality
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

// Test data - using existing volunteer ID 42 (from meeting)
const TEST_VOLUNTEER_ID = 42;

async function testStudentAvailability() {
    console.log('🧪 Testing Student Availability Functionality');
    console.log('=' .repeat(50));
    
    try {
        // Test date with existing meeting (2025-09-09)
        console.log('\n📅 Testing date 2025-09-09 (has existing meeting):');
        const response1 = await fetch(`${API_BASE}/api/v1/volunteers/students/cards?date=2025-09-09`, {
            headers: {
                'Authorization': `Bearer ${generateTestToken(TEST_VOLUNTEER_ID)}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response1.ok) {
            const data1 = await response1.json();
            console.log('Available students:', data1.data?.available?.length || 0);
            console.log('Unavailable students:', data1.data?.unavailable?.length || 0);
            
            if (data1.data?.unavailable?.length > 0) {
                const student = data1.data.unavailable[0];
                console.log('First unavailable student:', {
                    name: student.full_name,
                    isOwner: student.meeting?.isOwner,
                    meetingTime: student.meeting?.time
                });
            }
        } else {
            console.log('❌ API Error:', response1.status, await response1.text());
        }
        
        // Test date without meetings (2025-09-11)
        console.log('\n📅 Testing date 2025-09-11 (no meetings):');
        const response2 = await fetch(`${API_BASE}/api/v1/volunteers/students/cards?date=2025-09-11`, {
            headers: {
                'Authorization': `Bearer ${generateTestToken(TEST_VOLUNTEER_ID)}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response2.ok) {
            const data2 = await response2.json();
            console.log('Available students:', data2.data?.available?.length || 0);
            console.log('Unavailable students:', data2.data?.unavailable?.length || 0);
        } else {
            console.log('❌ API Error:', response2.status, await response2.text());
        }
        
    } catch (error) {
        console.error('🚨 Test failed:', error.message);
    }
}

// Simple test JWT token generator (for development testing only)
function generateTestToken(userId) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ 
        id: userId, 
        role: 'volunteer',
        exp: Math.floor(Date.now() / 1000) + 3600 
    })).toString('base64');
    const signature = 'test-signature';
    return `${header}.${payload}.${signature}`;
}

testStudentAvailability();
