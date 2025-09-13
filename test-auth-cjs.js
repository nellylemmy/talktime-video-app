const jwt = require('jsonwebtoken');

// Test volunteer authentication
async function testAuth() {
    const volunteerId = 6;
    const JWT_SECRET = '2a1da5f5e82eb7b192102e9f81c116e52996fc152345193b1198ad8d5f0c4444';
    
    // Generate JWT token for authentication
    const token = jwt.sign(
        { 
            id: volunteerId, 
            role: 'volunteer',
            exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
        }, 
        JWT_SECRET
    );
    
    console.log('Testing volunteer authentication...');
    console.log('Volunteer ID:', volunteerId);
    
    try {
        // Test the profile endpoint first
        const response = await fetch('http://localhost:3000/api/v1/volunteer/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Profile request failed:', response.status, errorText);
            return;
        }
        
        const profileData = await response.json();
        console.log('✅ Profile request successful:', profileData);
        
        // Now test certificate preview
        const previewResponse = await fetch('http://localhost:3000/api/v1/volunteer/certificate/preview', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!previewResponse.ok) {
            const errorText = await previewResponse.text();
            console.error('Certificate preview failed:', previewResponse.status, errorText);
            return;
        }
        
        console.log('✅ Certificate preview successful');
        
        // Now test certificate download
        const downloadResponse = await fetch('http://localhost:3000/api/v1/volunteer/certificate/download', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            console.error('Certificate download failed:', downloadResponse.status, errorText);
            return;
        }
        
        console.log('✅ All endpoints working!');
        
    } catch (error) {
        console.error('Error testing auth:', error.message);
    }
}

// Run the test
testAuth().catch(console.error);
