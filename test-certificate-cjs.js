const jwt = require('jsonwebtoken');
const fs = require('fs');

// Test certificate generation - Single Page Portrait Version
async function testCertificate() {
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
    
    console.log('Testing certificate PDF generation...');
    console.log('Volunteer ID:', volunteerId);
    console.log('JWT Token generated');
    
    try {
        // Test the certificate download endpoint
        const response = await fetch('http://localhost:3000/api/v1/volunteer/certificate/download', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Certificate generation failed:', response.status, errorText);
            return;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        console.log('Certificate PDF generated successfully!');
        console.log('PDF size:', pdfBuffer.length, 'bytes');
        
        // Check if it's a valid PDF
        const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
        console.log('PDF header:', pdfHeader);
        
        if (pdfHeader === '%PDF') {
            console.log('✅ Valid PDF generated');
            
            // Count pages in the PDF by looking for page objects
            const pdfString = pdfBuffer.toString('binary');
            
            // Method 1: Count /Type /Page objects
            const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
            const pageCount1 = pageMatches ? pageMatches.length : 0;
            
            // Method 2: Look for /Count in the page tree
            const countMatch = pdfString.match(/\/Count\s+(\d+)/);
            const pageCount2 = countMatch ? parseInt(countMatch[1]) : 0;
            
            console.log('📄 Page count (method 1 - /Type/Page):', pageCount1);
            console.log('📄 Page count (method 2 - /Count):', pageCount2);
            
            if (pageCount1 === 1 || pageCount2 === 1) {
                console.log('🎉 SUCCESS: Single page certificate generated!');
            } else {
                console.log('⚠️  ISSUE: Multiple pages detected - PDF has', Math.max(pageCount1, pageCount2), 'pages');
            }
            
            // Save the PDF for manual inspection
            const fileName = `test_certificate_single_page_${Date.now()}.pdf`;
            fs.writeFileSync(fileName, pdfBuffer);
            console.log('📁 PDF saved as:', fileName);
            
        } else {
            console.log('❌ Invalid PDF format');
        }
        
    } catch (error) {
        console.error('Error testing certificate:', error.message);
    }
}

// Run the test
testCertificate().catch(console.error);
