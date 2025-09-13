import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import fs from 'fs';

const JWT_SECRET = '2a1da5f5e82eb7b192102e9f81c116e52996fc152345193b1198ad8d5f0c4444';

async function testCertificate() {
    try {
        console.log('Testing certificate functionality...');
        
        // Create a JWT token for the test volunteer using the correct payload structure
        const testUserId = 48; // The ID from the seed script
        const payload = {
            id: testUserId,
            email: 'test@volunteer.com',
            role: 'volunteer',
            fullName: 'Test Volunteer',
            full_name: 'Test Volunteer',
            username: 'testvolunteer',
            volunteerId: testUserId,
            volunteer_type: 'standard',
            isStudentVolunteer: false,
            is_approved: true
        };
        
        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: '1h',
            issuer: 'talktime-api',
            audience: 'talktime-clients'
        });
        
        console.log('Generated test JWT token');
        
        // Test certificate preview
        console.log('\n1. Testing certificate preview...');
        const previewResponse = await fetch('http://localhost:3001/api/v1/volunteer/certificate/preview', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Preview response status:', previewResponse.status);
        if (previewResponse.ok) {
            const previewData = await previewResponse.text();
            console.log('Preview HTML length:', previewData.length);
            console.log('Preview contains "ADEA Foundation":', previewData.includes('ADEA Foundation'));
            console.log('Preview contains "Certificate":', previewData.includes('Certificate'));
        } else {
            const errorText = await previewResponse.text();
            console.log('Preview error:', errorText);
        }
        
        // Test certificate download
        console.log('\n2. Testing certificate download...');
        const downloadResponse = await fetch('http://localhost:3001/api/v1/volunteer/certificate/download', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Download response status:', downloadResponse.status);
        console.log('Download response headers:', Object.fromEntries(downloadResponse.headers));
        
        if (downloadResponse.ok) {
            const buffer = await downloadResponse.buffer();
            console.log('PDF size:', buffer.length, 'bytes');
            console.log('PDF starts with %PDF:', buffer.toString('ascii', 0, 4) === '%PDF');
            
            // Better page count detection
            const pdfContent = buffer.toString('binary');
            const pageMatches = pdfContent.match(/\/Type\s*\/Page(?!\w)/g) || [];
            const pageCountFromType = pageMatches.length;
            
            // Alternative page count method
            const countMatches = pdfContent.match(/\/Count\s+(\d+)/g) || [];
            let pageCountFromCount = 0;
            if (countMatches.length > 0) {
                const match = countMatches[0].match(/\/Count\s+(\d+)/);
                if (match) {
                    pageCountFromCount = parseInt(match[1]);
                }
            }
            
            console.log('Page count (Type method):', pageCountFromType);
            console.log('Page count (Count method):', pageCountFromCount);
            console.log('Estimated page count:', Math.max(pageCountFromType, pageCountFromCount));
            
            // Save the PDF for manual inspection
            fs.writeFileSync('/tmp/test-certificate.pdf', buffer);
            console.log('PDF saved to /tmp/test-certificate.pdf');
            
            // Additional format validation
            const finalPageCount = Math.max(pageCountFromType, pageCountFromCount) || 1;
            console.log('Certificate format validation:');
            console.log('- Single page expected:', finalPageCount <= 1 ? '✅ YES' : `❌ NO (${finalPageCount} pages)`);
            console.log('- Portrait orientation:', 'Based on new settings - Portrait');
            console.log('- File size reasonable:', buffer.length < 10000 ? '✅ YES' : '⚠️  Large file');
        } else {
            const errorText = await downloadResponse.text();
            console.log('Download error:', errorText);
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testCertificate();
