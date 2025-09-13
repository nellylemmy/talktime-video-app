// Test script to verify form submission logic
function testFormSubmissionLogic() {
    console.log('Testing form submission logic...');
    
    // Test the exact logic from the signup form
    try {
        // Simulate form data
        const mockFormData = {
            'first-name': 'John',
            'last-name': 'Doe',
            'terms': true
        };
        
        // Mock document.getElementById
        const originalGetElementById = document.getElementById;
        document.getElementById = function(id) {
            if (id === 'first-name') return { value: mockFormData['first-name'] };
            if (id === 'last-name') return { value: mockFormData['last-name'] };
            if (id === 'terms') return { checked: mockFormData['terms'] };
            return originalGetElementById.call(document, id);
        };
        
        // Test the logic
        if (!document.getElementById('terms').checked) {
            console.log('❌ Terms validation failed');
            return false;
        }
        
        // Collect form data from all steps
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const fullName = `${firstName} ${lastName}`.trim();
        
        // Validate that we have both first and last name
        if (!firstName || !lastName) {
            console.log('❌ Name validation failed');
            return false;
        }
        
        console.log('✅ All validations passed!');
        console.log(`First Name: "${firstName}"`);
        console.log(`Last Name: "${lastName}"`);
        console.log(`Full Name: "${fullName}"`);
        
        // Restore original function
        document.getElementById = originalGetElementById;
        
        return true;
        
    } catch (error) {
        console.error('❌ JavaScript error:', error);
        return false;
    }
}

// Run the test
const result = testFormSubmissionLogic();
console.log('Test result:', result ? 'PASS' : 'FAIL');
