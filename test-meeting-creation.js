const axios = require('axios');

async function testMeetingCreation() {
    try {
        // First, let's check the current notification count
        console.log('🔍 Testing meeting creation notifications...');
        
        // Get a valid JWT token (you'll need to replace this with a real one)
        // For now, let's just test if the endpoint is accessible
        
        const response = await axios.get('http://localhost:3001/api/v1/debug/test', {
            timeout: 5000
        });
        
        console.log('✅ Backend is accessible');
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ Backend not accessible - please check if containers are running');
        } else {
            console.log('Response status:', error.response?.status);
            console.log('Response:', error.response?.data);
        }
    }
}

testMeetingCreation();
