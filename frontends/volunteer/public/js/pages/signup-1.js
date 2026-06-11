
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.add('page-ready');
            // --- NAME AUTO-CAPITALIZATION ---
            function capitalizeName(name) {
                if (!name || typeof name !== 'string') return name;
                const trimmed = name.trim().replace(/\s+/g, ' ');
                if (!trimmed) return trimmed;
                return trimmed.split(' ').map(word => {
                    if (!word) return word;
                    // Handle hyphens: mary-jane -> Mary-Jane
                    if (word.includes('-')) {
                        return word.split('-').map(part =>
                            part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
                        ).join('-');
                    }
                    // Handle apostrophes: o'brien -> O'Brien
                    if (word.includes("'")) {
                        return word.split("'").map(part =>
                            part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
                        ).join("'");
                    }
                    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                }).join(' ');
            }

            // Auto-capitalize first and last name on blur
            const firstNameInput = document.getElementById('first-name');
            const lastNameInput = document.getElementById('last-name');

            if (firstNameInput) {
                firstNameInput.addEventListener('blur', function() {
                    this.value = capitalizeName(this.value);
                });
            }

            if (lastNameInput) {
                lastNameInput.addEventListener('blur', function() {
                    this.value = capitalizeName(this.value);
                });
            }

            // --- COUNTRY CODE POPULATION ---
            const countries = [
                { name: "United States", shortName: "US", code: "+1", flag: "\u{1F1FA}\u{1F1F8}" },
                { name: "Afghanistan", shortName: "AF", code: "+93", flag: "\u{1F1E6}\u{1F1EB}" },
                { name: "Albania", shortName: "AL", code: "+355", flag: "\u{1F1E6}\u{1F1F1}" },
                { name: "Algeria", shortName: "DZ", code: "+213", flag: "\u{1F1E9}\u{1F1FF}" },
                { name: "American Samoa", shortName: "AS", code: "+1684", flag: "\u{1F1E6}\u{1F1F8}" },
                { name: "Andorra", shortName: "AD", code: "+376", flag: "\u{1F1E6}\u{1F1E9}" },
                { name: "Angola", shortName: "AO", code: "+244", flag: "\u{1F1E6}\u{1F1F4}" },
                { name: "Anguilla", shortName: "AI", code: "+1264", flag: "\u{1F1E6}\u{1F1EE}" },
                { name: "Antarctica", shortName: "AQ", code: "+672", flag: "\u{1F1E6}\u{1F1F6}" },
                { name: "Antigua and Barbuda", shortName: "AG", code: "+1268", flag: "\u{1F1E6}\u{1F1EC}" },
                { name: "Argentina", shortName: "AR", code: "+54", flag: "\u{1F1E6}\u{1F1F7}" },
                { name: "Armenia", shortName: "AM", code: "+374", flag: "\u{1F1E6}\u{1F1F2}" },
                { name: "Aruba", shortName: "AW", code: "+297", flag: "\u{1F1E6}\u{1F1FC}" },
                { name: "Australia", shortName: "AU", code: "+61", flag: "\u{1F1E6}\u{1F1FA}" },
                { name: "Austria", shortName: "AT", code: "+43", flag: "\u{1F1E6}\u{1F1F9}" },
                { name: "Azerbaijan", shortName: "AZ", code: "+994", flag: "\u{1F1E6}\u{1F1FF}" },
                { name: "Bahamas", shortName: "BS", code: "+1242", flag: "\u{1F1E7}\u{1F1F8}" },
                { name: "Bahrain", shortName: "BH", code: "+973", flag: "\u{1F1E7}\u{1F1ED}" },
                { name: "Bangladesh", shortName: "BD", code: "+880", flag: "\u{1F1E7}\u{1F1E9}" },
                { name: "Barbados", shortName: "BB", code: "+1246", flag: "\u{1F1E7}\u{1F1E7}" },
                { name: "Belarus", shortName: "BY", code: "+375", flag: "\u{1F1E7}\u{1F1FE}" },
                { name: "Belgium", shortName: "BE", code: "+32", flag: "\u{1F1E7}\u{1F1EA}" },
                { name: "Belize", shortName: "BZ", code: "+501", flag: "\u{1F1E7}\u{1F1FF}" },
                { name: "Benin", shortName: "BJ", code: "+229", flag: "\u{1F1E7}\u{1F1EF}" },
                { name: "Bermuda", shortName: "BM", code: "+1441", flag: "\u{1F1E7}\u{1F1F2}" },
                { name: "Bhutan", shortName: "BT", code: "+975", flag: "\u{1F1E7}\u{1F1F9}" },
                { name: "Bolivia", shortName: "BO", code: "+591", flag: "\u{1F1E7}\u{1F1F4}" },
                { name: "Bosnia and Herzegovina", shortName: "BA", code: "+387", flag: "\u{1F1E7}\u{1F1E6}" },
                { name: "Botswana", shortName: "BW", code: "+267", flag: "\u{1F1E7}\u{1F1FC}" },
                { name: "Brazil", shortName: "BR", code: "+55", flag: "\u{1F1E7}\u{1F1F7}" },
                { name: "British Virgin Islands", shortName: "VG", code: "+1284", flag: "\u{1F1FB}\u{1F1EC}" },
                { name: "Brunei", shortName: "BN", code: "+673", flag: "\u{1F1E7}\u{1F1F3}" },
                { name: "Bulgaria", shortName: "BG", code: "+359", flag: "\u{1F1E7}\u{1F1EC}" },
                { name: "Burkina Faso", shortName: "BF", code: "+226", flag: "\u{1F1E7}\u{1F1EB}" },
                { name: "Burundi", shortName: "BI", code: "+257", flag: "\u{1F1E7}\u{1F1EE}" },
                { name: "Cambodia", shortName: "KH", code: "+855", flag: "\u{1F1F0}\u{1F1ED}" },
                { name: "Cameroon", shortName: "CM", code: "+237", flag: "\u{1F1E8}\u{1F1F2}" },
                { name: "Canada", shortName: "CA", code: "+1", flag: "\u{1F1E8}\u{1F1E6}" },
                { name: "Cape Verde", shortName: "CV", code: "+238", flag: "\u{1F1E8}\u{1F1FB}" },
                { name: "Cayman Islands", shortName: "KY", code: "+1345", flag: "\u{1F1F0}\u{1F1FE}" },
                { name: "Central African Republic", shortName: "CF", code: "+236", flag: "\u{1F1E8}\u{1F1EB}" },
                { name: "Chad", shortName: "TD", code: "+235", flag: "\u{1F1F9}\u{1F1E9}" },
                { name: "Chile", shortName: "CL", code: "+56", flag: "\u{1F1E8}\u{1F1F1}" },
                { name: "China", shortName: "CN", code: "+86", flag: "\u{1F1E8}\u{1F1F3}" },
                { name: "Colombia", shortName: "CO", code: "+57", flag: "\u{1F1E8}\u{1F1F4}" },
                { name: "Congo", shortName: "CD", code: "+243", flag: "\u{1F1E8}\u{1F1E9}" },
                { name: "Costa Rica", shortName: "CR", code: "+506", flag: "\u{1F1E8}\u{1F1F7}" },
                { name: "Croatia", shortName: "HR", code: "+385", flag: "\u{1F1ED}\u{1F1F7}" },
                { name: "Cuba", shortName: "CU", code: "+53", flag: "\u{1F1E8}\u{1F1FA}" },
                { name: "Cyprus", shortName: "CY", code: "+357", flag: "\u{1F1E8}\u{1F1FE}" },
                { name: "Czech Republic", shortName: "CZ", code: "+420", flag: "\u{1F1E8}\u{1F1FF}" },
                { name: "Denmark", shortName: "DK", code: "+45", flag: "\u{1F1E9}\u{1F1F0}" },
                { name: "Ecuador", shortName: "EC", code: "+593", flag: "\u{1F1EA}\u{1F1E8}" },
                { name: "Egypt", shortName: "EG", code: "+20", flag: "\u{1F1EA}\u{1F1EC}" },
                { name: "Estonia", shortName: "EE", code: "+372", flag: "\u{1F1EA}\u{1F1EA}" },
                { name: "Ethiopia", shortName: "ET", code: "+251", flag: "\u{1F1EA}\u{1F1F9}" },
                { name: "Finland", shortName: "FI", code: "+358", flag: "\u{1F1EB}\u{1F1EE}" },
                { name: "France", shortName: "FR", code: "+33", flag: "\u{1F1EB}\u{1F1F7}" },
                { name: "Germany", shortName: "DE", code: "+49", flag: "\u{1F1E9}\u{1F1EA}" },
                { name: "Ghana", shortName: "GH", code: "+233", flag: "\u{1F1EC}\u{1F1ED}" },
                { name: "Greece", shortName: "GR", code: "+30", flag: "\u{1F1EC}\u{1F1F7}" },
                { name: "Hong Kong", shortName: "HK", code: "+852", flag: "\u{1F1ED}\u{1F1F0}" },
                { name: "Hungary", shortName: "HU", code: "+36", flag: "\u{1F1ED}\u{1F1FA}" },
                { name: "India", shortName: "IN", code: "+91", flag: "\u{1F1EE}\u{1F1F3}" },
                { name: "Indonesia", shortName: "ID", code: "+62", flag: "\u{1F1EE}\u{1F1E9}" },
                { name: "Ireland", shortName: "IE", code: "+353", flag: "\u{1F1EE}\u{1F1EA}" },
                { name: "Israel", shortName: "IL", code: "+972", flag: "\u{1F1EE}\u{1F1F1}" },
                { name: "Italy", shortName: "IT", code: "+39", flag: "\u{1F1EE}\u{1F1F9}" },
                { name: "Jamaica", shortName: "JM", code: "+1876", flag: "\u{1F1EF}\u{1F1F2}" },
                { name: "Japan", shortName: "JP", code: "+81", flag: "\u{1F1EF}\u{1F1F5}" },
                { name: "Kenya", shortName: "KE", code: "+254", flag: "\u{1F1F0}\u{1F1EA}" },
                { name: "Malaysia", shortName: "MY", code: "+60", flag: "\u{1F1F2}\u{1F1FE}" },
                { name: "Mexico", shortName: "MX", code: "+52", flag: "\u{1F1F2}\u{1F1FD}" },
                { name: "Netherlands", shortName: "NL", code: "+31", flag: "\u{1F1F3}\u{1F1F1}" },
                { name: "New Zealand", shortName: "NZ", code: "+64", flag: "\u{1F1F3}\u{1F1FF}" },
                { name: "Nigeria", shortName: "NG", code: "+234", flag: "\u{1F1F3}\u{1F1EC}" },
                { name: "Norway", shortName: "NO", code: "+47", flag: "\u{1F1F3}\u{1F1F4}" },
                { name: "Pakistan", shortName: "PK", code: "+92", flag: "\u{1F1F5}\u{1F1F0}" },
                { name: "Philippines", shortName: "PH", code: "+63", flag: "\u{1F1F5}\u{1F1ED}" },
                { name: "Poland", shortName: "PL", code: "+48", flag: "\u{1F1F5}\u{1F1F1}" },
                { name: "Portugal", shortName: "PT", code: "+351", flag: "\u{1F1F5}\u{1F1F9}" },
                { name: "Russia", shortName: "RU", code: "+7", flag: "\u{1F1F7}\u{1F1FA}" },
                { name: "Saudi Arabia", shortName: "SA", code: "+966", flag: "\u{1F1F8}\u{1F1E6}" },
                { name: "Singapore", shortName: "SG", code: "+65", flag: "\u{1F1F8}\u{1F1EC}" },
                { name: "South Africa", shortName: "ZA", code: "+27", flag: "\u{1F1FF}\u{1F1E6}" },
                { name: "South Korea", shortName: "KR", code: "+82", flag: "\u{1F1F0}\u{1F1F7}" },
                { name: "Spain", shortName: "ES", code: "+34", flag: "\u{1F1EA}\u{1F1F8}" },
                { name: "Sweden", shortName: "SE", code: "+46", flag: "\u{1F1F8}\u{1F1EA}" },
                { name: "Switzerland", shortName: "CH", code: "+41", flag: "\u{1F1E8}\u{1F1ED}" },
                { name: "Tanzania", shortName: "TZ", code: "+255", flag: "\u{1F1F9}\u{1F1FF}" },
                { name: "Thailand", shortName: "TH", code: "+66", flag: "\u{1F1F9}\u{1F1ED}" },
                { name: "Turkey", shortName: "TR", code: "+90", flag: "\u{1F1F9}\u{1F1F7}" },
                { name: "Uganda", shortName: "UG", code: "+256", flag: "\u{1F1FA}\u{1F1EC}" },
                { name: "Ukraine", shortName: "UA", code: "+380", flag: "\u{1F1FA}\u{1F1E6}" },
                { name: "United Arab Emirates", shortName: "AE", code: "+971", flag: "\u{1F1E6}\u{1F1EA}" },
                { name: "United Kingdom", shortName: "GB", code: "+44", flag: "\u{1F1EC}\u{1F1E7}" },
                { name: "Vietnam", shortName: "VN", code: "+84", flag: "\u{1F1FB}\u{1F1F3}" },
                { name: "Zimbabwe", shortName: "ZW", code: "+263", flag: "\u{1F1FF}\u{1F1FC}" }
            ];

            function populateCountrySelector(selectElement) {
                countries.forEach(country => {
                    const option = document.createElement('option');
                    option.value = country.code;
                    option.textContent = `${country.flag} ${country.code} ${country.shortName}`;
                    option.setAttribute('data-name', country.name);
                    selectElement.appendChild(option);
                });
                selectElement.value = "+1";
            }

            const countryCodeSelect = document.getElementById('country-code');
            const parentCountryCodeSelect = document.getElementById('parent-country-code');

            populateCountrySelector(countryCodeSelect);
            populateCountrySelector(parentCountryCodeSelect);

            // --- TIMEZONE DETECTION AND POPULATION ---
            const commonTimezones = [
                { value: 'America/New_York', label: 'Eastern Time (US & Canada)', region: 'North America' },
                { value: 'America/Chicago', label: 'Central Time (US & Canada)', region: 'North America' },
                { value: 'America/Denver', label: 'Mountain Time (US & Canada)', region: 'North America' },
                { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)', region: 'North America' },
                { value: 'America/Phoenix', label: 'Arizona', region: 'North America' },
                { value: 'America/Anchorage', label: 'Alaska', region: 'North America' },
                { value: 'America/Honolulu', label: 'Hawaii', region: 'North America' },
                { value: 'America/Toronto', label: 'Toronto, Montreal', region: 'North America' },
                { value: 'America/Mexico_City', label: 'Mexico City', region: 'North America' },
                { value: 'America/Sao_Paulo', label: 'Sao Paulo, Brazil', region: 'South America' },
                { value: 'America/Buenos_Aires', label: 'Buenos Aires, Argentina', region: 'South America' },
                { value: 'Europe/London', label: 'London, Dublin', region: 'Europe' },
                { value: 'Europe/Paris', label: 'Paris, Berlin, Rome, Madrid', region: 'Europe' },
                { value: 'Europe/Amsterdam', label: 'Amsterdam, Brussels', region: 'Europe' },
                { value: 'Europe/Stockholm', label: 'Stockholm, Copenhagen', region: 'Europe' },
                { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
                { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa' },
                { value: 'Africa/Nairobi', label: 'Nairobi, Kenya (EAT)', region: 'Africa' },
                { value: 'Africa/Lagos', label: 'Lagos, Nigeria', region: 'Africa' },
                { value: 'Africa/Johannesburg', label: 'Johannesburg, Cape Town', region: 'Africa' },
                { value: 'Asia/Dubai', label: 'Dubai, Abu Dhabi', region: 'Middle East' },
                { value: 'Asia/Kolkata', label: 'Mumbai, Delhi, Kolkata', region: 'Asia' },
                { value: 'Asia/Shanghai', label: 'Beijing, Shanghai', region: 'Asia' },
                { value: 'Asia/Tokyo', label: 'Tokyo, Osaka', region: 'Asia' },
                { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia' },
                { value: 'Asia/Singapore', label: 'Singapore, Kuala Lumpur', region: 'Asia' },
                { value: 'Asia/Bangkok', label: 'Bangkok, Jakarta', region: 'Asia' },
                { value: 'Australia/Sydney', label: 'Sydney, Melbourne', region: 'Australia' },
                { value: 'Australia/Perth', label: 'Perth', region: 'Australia' },
                { value: 'Pacific/Auckland', label: 'Auckland, New Zealand', region: 'Pacific' }
            ];

            function detectCurrentTimezone() {
                try {
                    return Intl.DateTimeFormat().resolvedOptions().timeZone;
                } catch (error) {
                    console.warn('Timezone detection failed:', error);
                    return null;
                }
            }

            function populateTimezoneSelector() {
                const timezoneSelect = document.getElementById('timezone');
                const detectedTimezone = detectCurrentTimezone();

                timezoneSelect.innerHTML = '';

                const regionGroups = {};
                commonTimezones.forEach(tz => {
                    if (!regionGroups[tz.region]) {
                        regionGroups[tz.region] = [];
                    }
                    regionGroups[tz.region].push(tz);
                });

                Object.keys(regionGroups).forEach(region => {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = region;

                    regionGroups[region].forEach(timezone => {
                        const option = document.createElement('option');
                        option.value = timezone.value;
                        option.textContent = timezone.label;

                        if (timezone.value === detectedTimezone) {
                            option.selected = true;
                        }

                        optgroup.appendChild(option);
                    });

                    timezoneSelect.appendChild(optgroup);
                });

                const detectionNote = document.getElementById('timezone-detection-note');
                const selectedTimezone = commonTimezones.find(tz => tz.value === detectedTimezone);
                if (selectedTimezone) {
                    detectionNote.textContent = `Detected: ${selectedTimezone.label}. You can change this if needed.`;
                    detectionNote.style.color = '#10b981';
                } else if (detectedTimezone) {
                    // Detected zone is not in the curated list: add it as the selected
                    // option so the form never silently defaults to the wrong timezone
                    const detectedGroup = document.createElement('optgroup');
                    detectedGroup.label = 'Detected';
                    const option = document.createElement('option');
                    option.value = detectedTimezone;
                    option.textContent = detectedTimezone.replace(/_/g, ' ');
                    option.selected = true;
                    detectedGroup.appendChild(option);
                    timezoneSelect.insertBefore(detectedGroup, timezoneSelect.firstChild);
                    detectionNote.textContent = `Detected: ${detectedTimezone.replace(/_/g, ' ')}. You can change this if needed.`;
                    detectionNote.style.color = '#10b981';
                } else {
                    // Detection failed entirely: force an explicit choice
                    const placeholder = document.createElement('option');
                    placeholder.value = '';
                    placeholder.textContent = 'Select your timezone';
                    placeholder.selected = true;
                    placeholder.disabled = true;
                    timezoneSelect.insertBefore(placeholder, timezoneSelect.firstChild);
                    detectionNote.textContent = 'We could not detect your timezone. Please select it from the list.';
                }
            }

            function validateTimezone(timezone) {
                if (!timezone) return false;
                try {
                    new Intl.DateTimeFormat('en', { timeZone: timezone });
                    return true;
                } catch (error) {
                    return false;
                }
            }

            populateTimezoneSelector();

            document.getElementById('timezone').addEventListener('change', function() {
                const selectedTimezone = this.value;
                if (!validateTimezone(selectedTimezone)) {
                    this.setCustomValidity('Please select a valid timezone');
                } else {
                    this.setCustomValidity('');
                }
            });

            // --- CONDITIONAL SECTIONS LOGIC ---
            function updateConditionalSections() {
                const age = parseInt(document.getElementById('age').value) || 0;
                const volunteerType = document.querySelector('input[name="volunteer-type"]:checked')?.value;

                const parentalConsentSection = document.getElementById('parental-consent-section');
                const schoolInfoSection = document.getElementById('school-info-section');
                const consentReasonText = document.getElementById('consent-reason-text');

                const isUnder18 = age > 0 && age < 18;
                const isStudentVolunteer = volunteerType === 'student';
                const needsParentalApproval = isUnder18 || isStudentVolunteer;

                if (needsParentalApproval) {
                    parentalConsentSection.classList.add('show');
                    document.getElementById('parent-email').required = true;
                    document.getElementById('parent-phone').required = true;

                    // Update the reason text based on condition
                    if (isUnder18 && isStudentVolunteer) {
                        consentReasonText.textContent = 'As a student volunteer under 18, we require parental/guardian approval for your safety and to verify your community service participation.';
                    } else if (isUnder18) {
                        consentReasonText.textContent = 'For your safety, we require parental/guardian approval for all volunteers under 18 years old.';
                    } else if (isStudentVolunteer) {
                        consentReasonText.textContent = 'As a student volunteer, we require parental/guardian approval to verify your community service participation and provide official documentation to your school.';
                    }
                } else {
                    parentalConsentSection.classList.remove('show');
                    document.getElementById('parent-email').required = false;
                    document.getElementById('parent-phone').required = false;
                }

                if (isStudentVolunteer) {
                    schoolInfoSection.classList.add('show');
                    document.getElementById('school-name').required = true;
                } else {
                    schoolInfoSection.classList.remove('show');
                    document.getElementById('school-name').required = false;
                }

                // Adult standard volunteers have no conditional fields - show a
                // friendly ready state instead of an empty step
                const readyNote = document.getElementById('ready-to-submit-note');
                if (readyNote) {
                    readyNote.style.display = (!needsParentalApproval && !isStudentVolunteer) ? 'block' : 'none';
                }
            }

            document.getElementById('age').addEventListener('change', updateConditionalSections);
            document.querySelectorAll('input[name="volunteer-type"]').forEach(radio => {
                radio.addEventListener('change', updateConditionalSections);
            });

            // --- FIELD VALIDATION ENGINE ---
            // Tracks which fields have been touched (blurred at least once)
            const touchedFields = new Set();

            function setFieldState(inputEl, feedbackId, state, message) {
                const feedback = document.getElementById(feedbackId);
                inputEl.classList.remove('input-error', 'input-success');
                if (feedback) {
                    feedback.textContent = message || '';
                    feedback.className = 'field-feedback';
                }
                if (state === 'error') {
                    inputEl.classList.add('input-error');
                    if (feedback) feedback.classList.add('error');
                } else if (state === 'success') {
                    inputEl.classList.add('input-success');
                    if (feedback) feedback.classList.add('success');
                }
                // state === 'neutral' — no classes, just reset
            }

            // --- Individual field validators (return { valid, message }) ---
            function validateName(value, label) {
                const v = value.trim();
                if (!v) return { valid: false, message: `${label} is required` };
                if (v.length < 3) return { valid: false, message: `${label} must be at least 3 characters` };
                if (!/^[a-zA-Z\s'\-]+$/.test(v)) return { valid: false, message: `${label} can only contain letters, hyphens, and apostrophes` };
                return { valid: true, message: '' };
            }

            function validateUsername(value) {
                const v = value.trim();
                if (!v) return { valid: false, message: 'Preferred name is required' };
                if (v.length < 2) return { valid: false, message: 'Must be at least 2 characters' };
                return { valid: true, message: '' };
            }

            function validateEmail(value) {
                const v = value.trim();
                if (!v) return { valid: false, message: 'Email is required' };
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { valid: false, message: 'Enter a valid email address' };
                return { valid: true, message: '' };
            }

            function validateAge(value) {
                const v = value.trim();
                if (!v) return { valid: false, message: 'Age is required' };
                const n = parseInt(v, 10);
                if (isNaN(n) || n < 10) return { valid: false, message: 'Must be at least 10 years old' };
                if (n > 120) return { valid: false, message: 'Please enter a valid age' };
                return { valid: true, message: '' };
            }

            function validateGender(value) {
                if (!value) return { valid: false, message: 'Please select your gender' };
                return { valid: true, message: '' };
            }

            function validatePhone(value) {
                const digits = value.replace(/[\s\-()]/g, '');
                if (!digits) return { valid: false, message: 'Phone number is required' };
                if (!/^\d+$/.test(digits)) return { valid: false, message: 'Phone number can only contain digits' };
                if (digits.length < 6) return { valid: false, message: 'Phone number is too short' };
                if (digits.length > 15) return { valid: false, message: 'Phone number is too long' };
                return { valid: true, message: '' };
            }

            function validatePassword(password) {
                return {
                    length: password.length >= 8,
                    upper: /[A-Z]/.test(password),
                    number: /\d/.test(password),
                    special: /[!@#$%^&*()_+\-=\[\]{}|;':",.<>?\/`~]/.test(password)
                };
            }

            function validateSecurityQA(qId, aId) {
                const q = document.getElementById(qId).value;
                const a = document.getElementById(aId).value.trim();
                if (!q) return { valid: false, message: 'Please choose a security question' };
                if (!a) return { valid: false, message: 'Answer is required' };
                if (a.length < 2) return { valid: false, message: 'Answer must be at least 2 characters' };
                return { valid: true, message: '' };
            }

            // --- Run a validator and update the field UI ---
            function runFieldValidation(inputEl, feedbackId, validatorFn) {
                const result = validatorFn();
                if (result.valid) {
                    setFieldState(inputEl, feedbackId, 'success', '');
                } else {
                    setFieldState(inputEl, feedbackId, 'error', result.message);
                }
                return result.valid;
            }

            // --- Wire up blur + input events for each field ---
            function wireField(inputId, feedbackId, validatorFn) {
                const el = document.getElementById(inputId);
                if (!el) return;

                el.addEventListener('blur', () => {
                    touchedFields.add(inputId);
                    runFieldValidation(el, feedbackId, validatorFn);
                });

                el.addEventListener('input', () => {
                    if (touchedFields.has(inputId)) {
                        runFieldValidation(el, feedbackId, validatorFn);
                    }
                });

                // For selects, also listen on change
                if (el.tagName === 'SELECT') {
                    el.addEventListener('change', () => {
                        touchedFields.add(inputId);
                        runFieldValidation(el, feedbackId, validatorFn);
                    });
                }
            }

            // Step 1 fields
            wireField('first-name', 'first-name-feedback', () => validateName(document.getElementById('first-name').value, 'First name'));
            wireField('last-name', 'last-name-feedback', () => validateName(document.getElementById('last-name').value, 'Last name'));
            wireField('username', 'username-feedback', () => validateUsername(document.getElementById('username').value));
            wireField('email', 'email-feedback', () => validateEmail(document.getElementById('email').value));

            // Step 2 fields
            wireField('age', 'age-feedback', () => validateAge(document.getElementById('age').value));
            wireField('gender', 'gender-feedback', () => validateGender(document.getElementById('gender').value));
            wireField('phone', 'phone-feedback', () => validatePhone(document.getElementById('phone').value));

            // Step 3: Password requirements checklist
            function updatePasswordRequirements() {
                const password = document.getElementById('password').value;
                const rules = validatePassword(password);
                const hasTyped = password.length > 0;
                const allPass = rules.length && rules.upper && rules.number && rules.special;
                const pwInput = document.getElementById('password');

                const reqMap = {
                    'req-length': rules.length,
                    'req-upper': rules.upper,
                    'req-number': rules.number,
                    'req-special': rules.special
                };

                Object.entries(reqMap).forEach(([id, passed]) => {
                    const el = document.getElementById(id);
                    const icon = el.querySelector('i');
                    el.classList.remove('valid', 'invalid');
                    icon.className = 'fas';
                    if (!hasTyped) {
                        icon.classList.add('fa-circle');
                    } else if (passed) {
                        el.classList.add('valid');
                        icon.classList.add('fa-check');
                    } else {
                        el.classList.add('invalid');
                        icon.classList.add('fa-xmark');
                    }
                });

                // Set border state on password input
                pwInput.classList.remove('input-error', 'input-success');
                if (hasTyped) {
                    pwInput.classList.add(allPass ? 'input-success' : 'input-error');
                }

                updateConfirmPasswordFeedback();
            }

            function updateConfirmPasswordFeedback() {
                const password = document.getElementById('password').value;
                const confirm = document.getElementById('confirm-password').value;
                const confirmInput = document.getElementById('confirm-password');
                const feedback = document.getElementById('confirm-password-feedback');

                confirmInput.classList.remove('input-error', 'input-success');

                if (!confirm) {
                    feedback.textContent = '';
                    feedback.className = 'field-feedback';
                    return;
                }

                if (password === confirm) {
                    feedback.textContent = 'Passwords match';
                    feedback.className = 'field-feedback success';
                    confirmInput.classList.add('input-success');
                } else {
                    feedback.textContent = 'Passwords do not match';
                    feedback.className = 'field-feedback error';
                    confirmInput.classList.add('input-error');
                }
            }

            document.getElementById('password').addEventListener('input', updatePasswordRequirements);
            document.getElementById('password').addEventListener('blur', () => { touchedFields.add('password'); updatePasswordRequirements(); });
            document.getElementById('confirm-password').addEventListener('input', updateConfirmPasswordFeedback);
            document.getElementById('confirm-password').addEventListener('blur', () => { touchedFields.add('confirm-password'); updateConfirmPasswordFeedback(); });

            // Step 3: Security questions
            for (let i = 1; i <= 3; i++) {
                const qId = `security-question-${i}`;
                const aId = `security-answer-${i}`;
                const fbId = `security-${i}-feedback`;
                wireField(qId, fbId, () => validateSecurityQA(qId, aId));
                wireField(aId, fbId, () => validateSecurityQA(qId, aId));
            }

            // Step 4: Conditional fields
            wireField('parent-email', 'parent-email-feedback', () => validateEmail(document.getElementById('parent-email').value));
            wireField('parent-phone', 'parent-phone-feedback', () => validatePhone(document.getElementById('parent-phone').value));
            wireField('school-name', 'school-name-feedback', () => {
                const v = document.getElementById('school-name').value.trim();
                if (!v) return { valid: false, message: 'School name is required' };
                if (v.length < 3) return { valid: false, message: 'School name must be at least 3 characters' };
                return { valid: true, message: '' };
            });

            // --- MULTI-STEP FORM NAVIGATION ---
            let currentStep = 1;
            const totalSteps = 4;

            const form = document.getElementById('signup-form');
            const formSubmitButton = document.getElementById('submit-button');
            const nextButton = document.getElementById('next-button');
            const prevButton = document.getElementById('prev-button');
            const termsSection = document.getElementById('terms-section');

            function showStep(stepNumber) {
                for (let i = 1; i <= totalSteps; i++) {
                    const step = document.getElementById(`step-${i}`);
                    const indicator = document.getElementById(`step-indicator-${i}`);
                    const line = document.getElementById(`step-line-${i}`);

                    if (step) step.classList.remove('active');

                    if (indicator) {
                        indicator.classList.remove('current', 'completed', 'pending');
                        if (i < stepNumber) {
                            indicator.classList.add('completed');
                            indicator.innerHTML = '<i class="fas fa-check"></i>';
                        } else if (i === stepNumber) {
                            indicator.classList.add('current');
                            indicator.textContent = i;
                        } else {
                            indicator.classList.add('pending');
                            indicator.textContent = i;
                        }
                    }

                    if (line) {
                        line.classList.remove('completed');
                        if (i < stepNumber) {
                            line.classList.add('completed');
                        }
                    }
                }

                const currentStepElement = document.getElementById(`step-${stepNumber}`);
                if (currentStepElement) {
                    currentStepElement.classList.add('active');
                }

                prevButton.style.display = stepNumber > 1 ? 'flex' : 'none';
                nextButton.style.display = stepNumber < totalSteps ? 'flex' : 'none';
                formSubmitButton.style.display = stepNumber === totalSteps ? 'flex' : 'none';
                termsSection.style.display = stepNumber === totalSteps ? 'block' : 'none';
            }

            function validateCurrentStep() {
                let firstInvalid = null;

                function check(inputId, feedbackId, validatorFn) {
                    const el = document.getElementById(inputId);
                    touchedFields.add(inputId);
                    const valid = runFieldValidation(el, feedbackId, validatorFn);
                    if (!valid && !firstInvalid) firstInvalid = el;
                    return valid;
                }

                if (currentStep === 1) {
                    check('first-name', 'first-name-feedback', () => validateName(document.getElementById('first-name').value, 'First name'));
                    check('last-name', 'last-name-feedback', () => validateName(document.getElementById('last-name').value, 'Last name'));
                    check('username', 'username-feedback', () => validateUsername(document.getElementById('username').value));
                    check('email', 'email-feedback', () => validateEmail(document.getElementById('email').value));
                }

                if (currentStep === 2) {
                    check('age', 'age-feedback', () => validateAge(document.getElementById('age').value));
                    check('gender', 'gender-feedback', () => validateGender(document.getElementById('gender').value));
                    check('phone', 'phone-feedback', () => validatePhone(document.getElementById('phone').value));
                }

                if (currentStep === 3) {
                    // Password
                    const password = document.getElementById('password').value;
                    const rules = validatePassword(password);
                    touchedFields.add('password');
                    updatePasswordRequirements();
                    if (!rules.length || !rules.upper || !rules.number || !rules.special) {
                        if (!firstInvalid) firstInvalid = document.getElementById('password');
                    }

                    // Confirm password
                    const confirmPassword = document.getElementById('confirm-password').value;
                    touchedFields.add('confirm-password');
                    updateConfirmPasswordFeedback();
                    if (!confirmPassword || password !== confirmPassword) {
                        if (!firstInvalid) firstInvalid = document.getElementById('confirm-password');
                    }

                    // Security questions
                    for (let i = 1; i <= 3; i++) {
                        const qId = `security-question-${i}`;
                        const aId = `security-answer-${i}`;
                        const fbId = `security-${i}-feedback`;
                        check(qId, fbId, () => validateSecurityQA(qId, aId));
                        check(aId, fbId, () => validateSecurityQA(qId, aId));
                    }
                }

                if (currentStep === 4) {
                    const parentSection = document.getElementById('parental-consent-section');
                    if (parentSection.classList.contains('show')) {
                        check('parent-email', 'parent-email-feedback', () => validateEmail(document.getElementById('parent-email').value));
                        check('parent-phone', 'parent-phone-feedback', () => validatePhone(document.getElementById('parent-phone').value));
                    }
                    const schoolSection = document.getElementById('school-info-section');
                    if (schoolSection.classList.contains('show')) {
                        check('school-name', 'school-name-feedback', () => {
                            const v = document.getElementById('school-name').value.trim();
                            if (!v) return { valid: false, message: 'School name is required' };
                            if (v.length < 3) return { valid: false, message: 'School name must be at least 3 characters' };
                            return { valid: true, message: '' };
                        });
                    }
                }

                if (firstInvalid) {
                    firstInvalid.focus();
                    return false;
                }

                return true;
            }

            nextButton.addEventListener('click', async () => {
                if (!validateCurrentStep()) return;

                // Step 1: check email availability early so the user is not told
                // about a duplicate only after filling all four steps
                if (currentStep === 1) {
                    const emailEl = document.getElementById('email');
                    try {
                        const res = await fetch(`/api/v1/jwt-auth/volunteer/check-email?email=${encodeURIComponent(emailEl.value.trim())}`);
                        const data = await res.json();
                        if (data.success && data.available === false) {
                            const fb = document.getElementById('email-feedback');
                            if (fb) {
                                fb.textContent = 'An account with this email already exists. Log in instead, or use a different email.';
                                fb.className = 'field-feedback error';
                            }
                            emailEl.classList.add('error');
                            emailEl.focus();
                            return;
                        }
                    } catch (e) {
                        // Network hiccup: continue - final submit still validates
                    }
                }

                if (currentStep < totalSteps) {
                    currentStep++;
                    showStep(currentStep);

                    if (currentStep === 4) {
                        updateConditionalSections();
                    }
                }
            });

            prevButton.addEventListener('click', () => {
                if (currentStep > 1) {
                    currentStep--;
                    showStep(currentStep);
                }
            });

            showStep(1);

            // --- FORM SUBMISSION ---
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                if (!document.getElementById('terms').checked) {
                    if (window.showNotification) {
                        window.showNotification('Please accept the Terms and Conditions before creating your account.', 'warning', { title: 'Terms Required', autoClose: false });
                    }
                    return;
                }

                const firstName = document.getElementById('first-name').value.trim();
                const lastName = document.getElementById('last-name').value.trim();
                const fullName = `${firstName} ${lastName}`.trim();

                if (!firstName || !lastName) {
                    if (window.showNotification) {
                        window.showNotification('Please provide both your first name and last name.', 'warning', { title: 'Name Required', autoClose: false });
                    }
                    return;
                }

                const formData = {
                    username: document.getElementById('username').value,
                    full_name: fullName,
                    email: document.getElementById('email').value,
                    password: document.getElementById('password').value,
                    age: parseInt(document.getElementById('age').value),
                    gender: document.getElementById('gender').value,
                    phone: `${document.getElementById('country-code').value}${document.getElementById('phone').value}`,
                    timezone: document.getElementById('timezone').value,
                    volunteer_type: document.querySelector('input[name="volunteer-type"]:checked').value === 'student' ? 'student_volunteer' : 'standard'
                };

                const parentEmail = document.getElementById('parent-email').value;
                const parentPhone = document.getElementById('parent-phone').value;
                const schoolName = document.getElementById('school-name').value;

                if (parentEmail) formData.parent_email = parentEmail;
                if (parentPhone) formData.parent_phone = `${document.getElementById('parent-country-code').value}${parentPhone}`;
                if (schoolName) formData.school_name = schoolName;

                formData.security_questions = [
                    {
                        question: document.getElementById('security-question-1').value,
                        answer: document.getElementById('security-answer-1').value
                    },
                    {
                        question: document.getElementById('security-question-2').value,
                        answer: document.getElementById('security-answer-2').value
                    },
                    {
                        question: document.getElementById('security-question-3').value,
                        answer: document.getElementById('security-answer-3').value
                    }
                ];

                console.log('Form submission data:', formData);

                formSubmitButton.disabled = true;
                formSubmitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Creating Account...';

                try {
                    const response = await fetch('/api/v1/jwt-auth/volunteer/signup', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });

                    const data = await response.json();

                    if (data.success) {
                        const needsApproval = formData.age < 18 || formData.volunteer_type === 'student_volunteer';
                        if (!needsApproval) {
                            new TalkTimeJWTAuth('volunteer').storeAuth(data.accessToken, data.user, data.refreshToken);
                        }
                        if (window.showNotification) {
                            window.showNotification(
                                needsApproval
                                    ? 'Your account has been created. We have emailed your parent or guardian for approval.'
                                    : 'Your account has been created successfully! Welcome to TalkTime.',
                                'success', { title: 'Account Created', autoClose: true, duration: 2000 });
                        }

                        setTimeout(() => {
                            if (needsApproval) {
                                window.location.href = '/volunteer/pending-approval.html';
                            } else {
                                window.location.href = '/volunteer/dashboard/students.html';
                            }
                        }, 1500);
                    } else {
                        throw new Error(data.error || 'Registration failed');
                    }
                } catch (error) {
                    console.error('Registration error:', error);
                    const isDuplicateEmail = /already exists/i.test(error.message || '');
                    if (isDuplicateEmail) {
                        // Take the user back to the email field instead of leaving
                        // them stranded on step 4 with a generic toast
                        currentStep = 1;
                        showStep(1);
                        const emailField = document.getElementById('email');
                        if (emailField) {
                            emailField.classList.add('error');
                            emailField.focus();
                        }
                        if (window.showNotification) {
                            window.showNotification('An account with this email already exists. Use a different email, or log in instead.', 'error', { title: 'Email Already Registered', autoClose: false });
                        }
                    } else if (window.showNotification) {
                        window.showNotification(error.message || 'Registration failed. Please try again.', 'error', { title: 'Registration Error', autoClose: false });
                    }
                } finally {
                    formSubmitButton.disabled = false;
                    formSubmitButton.innerHTML = '<i class="fas fa-user-plus"></i>Create Account';
                }
            });
        });

        // Keyboard navigation support: Enter advances ONLY from text inputs.
        // Buttons, links, selects and textareas keep native Enter behavior
        // (so Enter on "Previous" activates Previous, not Next).
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag !== 'input') return;
            if (e.target.type === 'checkbox' || e.target.type === 'radio') return;
            e.preventDefault();
            const nextBtn = document.getElementById('next-button');
            const submitBtn = document.getElementById('submit-button');

            if (nextBtn.style.display !== 'none') {
                nextBtn.click();
            } else if (submitBtn.style.display !== 'none') {
                submitBtn.click();
            }
        });
    