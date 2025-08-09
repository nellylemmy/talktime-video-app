document.addEventListener('DOMContentLoaded', function () {
    const ageCheck = document.getElementById('age-check');
    const parentalConsent = document.getElementById('parental-consent');

    // Function to toggle parental consent section
    const toggleParentalConsent = () => {
        if (parentalConsent) {
            // If checkbox is checked (user is over 18), hide the section.
            // If unchecked (user is under 18), show the section.
            parentalConsent.style.display = ageCheck.checked ? 'none' : 'block';
        }
    };

    if (ageCheck) {
        // Set initial state on page load
        toggleParentalConsent();
        // Add event listener for changes
        ageCheck.addEventListener('change', toggleParentalConsent);
    }
});
