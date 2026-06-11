
    document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('page-ready');
        // --- DOM Elements ---
        const backLinkContainer = document.getElementById('back-link-container');
        const scheduleTitle = document.getElementById('schedule-title');
        const studentImage = document.getElementById('student-image');
        const studentName = document.getElementById('student-name');
        const studentDetails = document.getElementById('student-details');
        const volunteerTimezoneDisplay = document.getElementById('volunteer-timezone-display');
        const calendarMonth = document.getElementById('calendar-month');
        const calendarDays = document.getElementById('calendar-days');
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        const timeSelection = document.getElementById('time-selection');
        const selectedDateDisplay = document.getElementById('selected-date-display');
        const timeSlots = document.getElementById('time-slots');
        const confirmContainer = document.getElementById('confirm-container');
        const confirmBtn = document.getElementById('confirm-btn');
        const confirmModal = document.getElementById('confirm-modal');
        const modalStudentName = document.getElementById('modal-student-name');
        const modalDate = document.getElementById('modal-date');
        const modalTime = document.getElementById('modal-time');
        const modalCancel = document.getElementById('modal-cancel');
        const modalConfirm = document.getElementById('modal-confirm');
        const notificationEl = document.getElementById('notification');
        
        // --- State Variables ---
        let currentDate = new Date();
        let currentMonth = currentDate.getMonth();
        let currentYear = currentDate.getFullYear();
        let selectedDate = null;
        let selectedTimeSlot = null;
        let studentData = null;
        let meetingId = null; // For rescheduling
        let isRescheduling = false;
        let volunteerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // Browser timezone as immediate fallback; overwritten by profile fetch
        
        // --- Utility Functions ---
        function showNotification(message, type = 'success') {
            notificationEl.textContent = message;
            // Use explicit colors for visibility
            const bgColor = type === 'success' ? '#116C00' : '#D10100';
            const textColor = '#FFFFFF';
            notificationEl.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 16px 24px;
                border-radius: 12px;
                background-color: ${bgColor};
                color: ${textColor};
                font-weight: 500;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                z-index: 9999;
                max-width: 400px;
                word-wrap: break-word;
            `;
            notificationEl.className = '';
            notificationEl.classList.remove('hidden');
            
            setTimeout(() => {
                notificationEl.classList.add('hidden');
            }, 5000);
        }
        
        function showRestrictionModal(errorData) {
            const modal = document.getElementById('restriction-modal');
            const msgEl = document.getElementById('restriction-modal-message');
            const statsEl = document.getElementById('restriction-modal-stats');

            msgEl.textContent = errorData.message || 'Your account is restricted from scheduling new meetings.';

            const perf = errorData.performanceData || {};
            statsEl.innerHTML = `
                <div class="flex justify-between"><span class="text-gray-600">Cancellations:</span><strong class="text-red-700">${perf.cancelledCalls || 0} / ${(perf.thresholds && perf.thresholds.cancelCount) || 5}</strong></div>
                <div class="flex justify-between"><span class="text-gray-600">Missed calls:</span><strong class="text-red-700">${perf.missedCalls || 0} / ${(perf.thresholds && perf.thresholds.missedCount) || 4}</strong></div>
                <div class="flex justify-between"><span class="text-gray-600">Total meetings:</span><strong class="text-gray-800">${perf.totalCalls || 0}</strong></div>
            `;

            modal.classList.remove('hidden');
        }

        function formatDate(date) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString(undefined, options);
        }
        
        function formatTime(hours, minutes) {
            const period = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 || 12;
            return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
        }
        
        // Function to generate time slots for a specific date based on EAT constraints
        // Students are available: Morning 7:30-8:00 AM EAT, Evening 4:00-6:00 PM EAT, Mon-Sat only
        function generateTimeSlotsForDate(date, timezone) {
            const slots = [];

            // Extract the selected date components (year/month/day) for ISO string building
            const selectedDateObj = new Date(date);
            const yr = selectedDateObj.getFullYear();
            const mo = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
            const dy = String(selectedDateObj.getDate()).padStart(2, '0');

            // Block Sundays — students unavailable
            if (selectedDateObj.getDay() === 0) {
                return slots;
            }

            // Student availability windows in EAT
            const windows = [
                { startHour: 7, startMinute: 30, endHour: 8, endMinute: 0, interval: 30 },   // Morning: 7:30 AM (1 slot)
                { startHour: 16, startMinute: 0, endHour: 18, endMinute: 0, interval: 30 }    // Evening: 4:00-5:30 PM (4 slots)
            ];

            // Current time as UTC ms for filtering past slots.
            // The eatDate below is a correct UTC instant, so comparing against now
            // is timezone-safe for any calendar date - no browser-local "today" check needed.
            const nowMs = Date.now();

            // Generate slots for each availability window
            for (const win of windows) {
                let hour = win.startHour;
                let minute = win.startMinute;
                const endMs = win.endHour * 60 + win.endMinute;

                while (hour * 60 + minute < endMs) {
                    // Build EAT time with EXPLICIT +03:00 offset — timezone-safe regardless of browser
                    const hr = String(hour).padStart(2, '0');
                    const mi = String(minute).padStart(2, '0');
                    const eatIso = `${yr}-${mo}-${dy}T${hr}:${mi}:00+03:00`;
                    const eatDate = new Date(eatIso); // Internal UTC is correct

                    // Skip slots that are already in the past (timezone-safe UTC comparison)
                    if (eatDate.getTime() <= nowMs) {
                        minute += win.interval;
                        if (minute >= 60) { hour++; minute -= 60; }
                        continue;
                    }

                    // Get the hours and minutes in the volunteer's local timezone for display
                    const volunteerHour = parseInt(eatDate.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }));
                    const volunteerMinute = parseInt(eatDate.toLocaleString('en-US', { timeZone: timezone, minute: '2-digit' }));

                    // Format the time for display
                    const displayTime = formatTime(volunteerHour, volunteerMinute);

                    // Add the time slot
                    slots.push({
                        display: displayTime,
                        hour: volunteerHour,
                        minute: volunteerMinute,
                        eatHour: hour,
                        eatMinute: minute,
                        date: eatDate  // Correct UTC timestamp
                    });

                    minute += win.interval;
                    if (minute >= 60) { hour++; minute -= 60; }
                }
            }

            return slots;
        }
        
        // Function to convert EAT time to volunteer's timezone
        function convertEatToVolunteerTime(eatDate, volunteerTimezone) {
            // EAT is UTC+3, so we need to properly handle timezone conversion
            // First, treat the eatDate as if it's in EAT (UTC+3)
            const eatYear = eatDate.getFullYear();
            const eatMonth = eatDate.getMonth();
            const eatDay = eatDate.getDate();
            const eatHour = eatDate.getHours();
            const eatMinute = eatDate.getMinutes();
            
            // Create a date string in EAT timezone format
            const eatTimeString = `${eatYear}-${String(eatMonth + 1).padStart(2, '0')}-${String(eatDay).padStart(2, '0')}T${String(eatHour).padStart(2, '0')}:${String(eatMinute).padStart(2, '0')}:00+03:00`;
            
            // Parse this as a proper timezone-aware date
            const eatDateWithTimezone = new Date(eatTimeString);
            
            // Convert to volunteer's local timezone (browser will handle this automatically)
            return eatDateWithTimezone;
        }
        
        // Function to convert volunteer time to EAT
        function convertVolunteerTimeToEat(volunteerDate, volunteerTimezone) {
            // The volunteerDate is in the volunteer's local timezone
            // We need to convert it to EAT (UTC+3)
            
            // Get the UTC time from the volunteer's local time
            const utcTime = volunteerDate.getTime() + (volunteerDate.getTimezoneOffset() * 60000);
            
            // EAT is UTC+3 (3 hours ahead of UTC)
            const eatTime = utcTime + (3 * 60 * 60 * 1000);
            
            // Create the EAT date
            const eatDate = new Date(eatTime);
            
            return eatDate;
        }
        
        // Function to get URL parameters
        function getUrlParams() {
            // Parse query parameters from the new URL structure
            // Format: /volunteer/dashboard/schedule.html?id=1&admission=ADM0001&name=Test%20Student&meeting=123
            const searchParams = new URLSearchParams(window.location.search);
            
            const id = searchParams.get('id');
            const admission = searchParams.get('admission');
            const name = searchParams.get('name');
            const meetingParam = searchParams.get('meeting'); // For reschedule requests
            
            // Validate that we have the required parameters
            if (id && admission && name) {
                return {
                    studentId: id,
                    studentAdmission: admission,
                    studentName: decodeURIComponent(name),
                    action: meetingParam ? 'update' : 'new', // If meeting ID is present, it's a reschedule
                    meetingId: meetingParam
                };
            }
            
            // If query parameters are missing, return null (user accessed page directly from navigation)
            return null;
        }
        
        // --- Calendar Functions ---
        function renderCalendar() {
            const firstDay = new Date(currentYear, currentMonth, 1);
            const lastDay = new Date(currentYear, currentMonth + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startingDay = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Update month display
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            calendarMonth.textContent = `${monthNames[currentMonth]} ${currentYear}`;
            
            // Clear calendar
            calendarDays.innerHTML = '';
            
            // Add empty cells for days before the first day of the month
            for (let i = 0; i < startingDay; i++) {
                const emptyDay = document.createElement('div');
                calendarDays.appendChild(emptyDay);
            }
            
            // Add days of the month
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const dayEl = document.createElement('div');
                dayEl.textContent = day;
                dayEl.classList.add('calendar-day');
                
                const dateToCheck = new Date(currentYear, currentMonth, day);
                
                // Calculate 3-month limit from today
                const threeMonthsFromToday = new Date(today);
                threeMonthsFromToday.setMonth(today.getMonth() + 3);
                
                // Check if this day is in the past (in EAT - the calendar shows EAT dates),
                // beyond the 3-month window, or a Sunday
                const eatTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
                const cellStr = `${dateToCheck.getFullYear()}-${String(dateToCheck.getMonth() + 1).padStart(2, '0')}-${String(dateToCheck.getDate()).padStart(2, '0')}`;
                if (cellStr < eatTodayStr ||
                    dateToCheck > threeMonthsFromToday ||
                    dateToCheck.getDay() === 0) {
                    dayEl.classList.add('day-disabled');
                    if (dateToCheck.getDay() === 0) {
                        dayEl.title = 'Students unavailable on Sundays';
                    }
                } else {
                    // Check if this is the selected date
                    if (selectedDate && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear()) {
                        dayEl.classList.add('day-selected');
                    }
                    
                    // Check if this is today
                    if (day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
                        dayEl.classList.add('day-today');
                    }
                    
                    // Add click event
                    dayEl.addEventListener('click', () => {
                        // Remove selected class from all days
                        document.querySelectorAll('.day-selected').forEach(el => el.classList.remove('day-selected'));
                        
                        // Add selected class to this day
                        dayEl.classList.add('day-selected');
                        
                        // Update selected date
                        selectedDate = new Date(currentYear, currentMonth, day);
                        
                        // Show time selection
                        showTimeSelection();
                    });
                }
                
                calendarDays.appendChild(dayEl);
            }
        }
        
        function showTimeSelection() {
            // Format the selected date for display
            selectedDateDisplay.textContent = `(${formatDate(selectedDate)})`;

            // Show time selection section
            timeSelection.classList.remove('hidden');

            // Generate time slots (async - capacity fetch); callers can await
            const slotsReady = generateTimeSlots();

            // Scroll to time selection
            timeSelection.scrollIntoView({ behavior: 'smooth' });

            return slotsReady;
        }
        
        async function fetchSlotCapacity(dateStr) {
            try {
                const response = await TalkTimeAuth.authenticatedRequest(`/api/v1/volunteers/slot-capacity?date=${dateStr}`);
                if (!response.ok) throw new Error('Failed to fetch slot capacity');
                return await response.json();
            } catch (err) {
                console.error('Error fetching slot capacity:', err);
                // Fallback: allow all slots (don't block scheduling on API error)
                return { maxConcurrent: 999, slotCounts: {} };
            }
        }

        let slotGenerationToken = 0;
        async function generateTimeSlots() {
            // Sequencing token: rapid date clicks must not interleave - only the
            // latest invocation may render after its network await resolves
            const myToken = ++slotGenerationToken;

            // Clear existing time slots
            timeSlots.innerHTML = '';

            // Use volunteer's saved timezone
            const timezone = volunteerTimezone;

            // Generate time slots based on student availability windows
            let slots = generateTimeSlotsForDate(selectedDate, timezone);

            // Fetch slot capacity and filter out full slots
            const yr = selectedDate.getFullYear();
            const mo = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const dy = String(selectedDate.getDate()).padStart(2, '0');
            const dateStr = `${yr}-${mo}-${dy}`;

            const capacityData = await fetchSlotCapacity(dateStr);
            if (myToken !== slotGenerationToken) return; // superseded by a newer click
            slots = slots.filter(slot => {
                const eatTime = `${String(slot.eatHour).padStart(2, '0')}:${String(slot.eatMinute).padStart(2, '0')}`;
                return (capacityData.slotCounts[eatTime] || 0) < capacityData.maxConcurrent;
            });

            // Show message if no slots available
            if (slots.length === 0) {
                const today = new Date();
                const isToday = selectedDate.toDateString() === today.toDateString();
                const allSlotsRaw = generateTimeSlotsForDate(selectedDate, timezone);
                const allFullyBooked = allSlotsRaw.length > 0 && slots.length === 0;
                const msg = document.createElement('div');
                msg.className = 'text-center py-6 col-span-full';
                if (allFullyBooked) {
                    msg.innerHTML = `<p class="text-xs text-gray-400"><i class="fas fa-calendar-times mr-1"></i>All time slots are fully booked for this date.</p>
                       <p class="text-xs text-gray-300 mt-1">Please try another day.</p>`;
                } else if (isToday) {
                    msg.innerHTML = `<p class="text-xs text-gray-400"><i class="fas fa-clock mr-1"></i>All available time slots for today have passed.</p>
                       <p class="text-xs text-gray-300 mt-1">Students are available 7:30\u20138:00 AM and 4:00\u20136:00 PM EAT, Mon\u2013Sat. Please select another date.</p>`;
                } else {
                    msg.innerHTML = `<p class="text-xs text-gray-400"><i class="fas fa-clock mr-1"></i>No available time slots for this date.</p>`;
                }
                timeSlots.appendChild(msg);
                confirmContainer.classList.add('hidden');
                return;
            }

            // Add time slots to the UI — show volunteer's local time + EAT time
            slots.forEach(slot => {
                const timeSlot = document.createElement('div');
                const eatDisplay = formatTime(slot.eatHour, slot.eatMinute);
                // If volunteer's timezone is Africa/Nairobi (EAT), only show one time
                if (timezone === 'Africa/Nairobi') {
                    timeSlot.textContent = slot.display;
                } else {
                    // Date-boundary safety: if this slot falls on a different calendar
                    // day in the volunteer's timezone, show their local weekday so
                    // "Tue 23:00" is never mistaken for the EAT calendar date
                    const localDay = slot.date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
                    const eatDay = slot.date.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' });
                    const dayPrefix = localDay !== eatDay ? `${localDay} ` : '';
                    timeSlot.innerHTML = `<span style="display:block;font-size:13px;font-weight:600;">${dayPrefix}${slot.display}</span><span style="display:block;font-size:10px;color:#9ca3af;margin-top:1px;">${eatDisplay} EAT</span>`;
                }
                timeSlot.classList.add('time-slot');
                timeSlot.dataset.eatHour = slot.eatHour;
                timeSlot.dataset.eatMinute = slot.eatMinute;

                // Add click event
                timeSlot.addEventListener('click', () => {
                    // Remove selected class from all time slots
                    document.querySelectorAll('.time-selected').forEach(el => el.classList.remove('time-selected'));

                    // Add selected class to this time slot
                    timeSlot.classList.add('time-selected');

                    // Update selected time slot with both volunteer time and EAT time
                    selectedTimeSlot = {
                        hour: slot.hour,
                        minute: slot.minute,
                        eatHour: slot.eatHour,
                        eatMinute: slot.eatMinute
                    };

                    // Show confirm button
                    confirmContainer.classList.remove('hidden');
                });

                timeSlots.appendChild(timeSlot);
            });
        }
        
        // Track whether we are in auto-assign mode (no student param)
        let isAutoAssignMode = false;

        // --- Data Loading ---
        function loadStudentData() {
            const params = getUrlParams();

            if (!params) {
                // AUTO-ASSIGN MODE: No student in URL — show calendar directly
                isAutoAssignMode = true;
                const noStudentState = document.getElementById('no-student-state');
                const pageScheduler = document.getElementById('page-scheduler');
                const backLinkContainerEl = document.getElementById('back-link-container');
                const meetingLimitStatus = document.getElementById('meeting-limit-status');

                if (noStudentState) noStudentState.classList.add('hidden');
                if (pageScheduler) pageScheduler.classList.remove('hidden');

                // Show back link to My Students
                if (backLinkContainerEl) {
                    backLinkContainerEl.classList.remove('hidden');
                    backLinkContainerEl.innerHTML = '<a href="/volunteer/dashboard/students" class="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors"><i class="fas fa-arrow-left"></i>Back to My Schedules</a>';
                }

                // Hide student image, show generic header
                if (studentImage) studentImage.style.display = 'none';
                if (scheduleTitle) scheduleTitle.textContent = 'Schedule New Meeting';
                if (studentName) {
                    studentName.textContent = '';
                }
                if (studentDetails) studentDetails.textContent = 'A student will be assigned automatically';
                if (meetingLimitStatus) meetingLimitStatus.style.display = 'none';

                // Update modal student name for auto-assign
                if (modalStudentName) modalStudentName.textContent = 'an auto-assigned student';

                document.title = 'TalkTime - Schedule Meeting | Volunteer Dashboard';

                // Load timezone and render calendar
                loadVolunteerTimezone();
                return;
            }

            // MANUAL MODE: Student selected - show the scheduler
            isAutoAssignMode = false;
            const noStudentState = document.getElementById('no-student-state');
            const pageScheduler = document.getElementById('page-scheduler');
            const backLinkContainerEl = document.getElementById('back-link-container');

            if (noStudentState) noStudentState.classList.add('hidden');
            if (pageScheduler) pageScheduler.classList.remove('hidden');
            if (backLinkContainerEl) backLinkContainerEl.classList.remove('hidden');

            // Check if this is a reschedule
            isRescheduling = params.action === 'update';
            if (isRescheduling) {
                scheduleTitle.textContent = 'Reschedule Meeting with';
                meetingId = params.meetingId;
                document.title = 'TalkTime - Reschedule Meeting | Volunteer Dashboard';
            } else {
                document.title = 'TalkTime - Schedule Meeting | Volunteer Dashboard';
            }

            // Update canonical link
            const canonicalLink = document.getElementById('canonical-link');
            canonicalLink.href = window.location.href;

            // Update back link
            backLinkContainerEl.innerHTML = `
                <a href="/volunteer/dashboard/student-detail.html?id=${params.studentId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}" class="text-brand-primary hover:text-brand-primary flex items-center">
                    <i class="fas fa-arrow-left mr-2"></i>
                    Back to Student Profile
                </a>
            `;

            // Fire independent requests in parallel with the student fetch
            checkMeetingLimitStatus(params.studentId);
            loadVolunteerTimezone();

            // Fetch student data using JWT authentication
            TalkTimeAuth.authenticatedRequest(`/api/v1/volunteers/students/${params.studentId}/profile`, {
                method: 'GET'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    studentData = data.student;

                    console.log('Received student data with numeric ID:', studentData.id);

                    studentName.textContent = studentData.full_name || studentData.name || params.studentName;
                    const ageParts = [];
                    if (studentData.age) ageParts.push(studentData.age + ' years');
                    if (studentData.gender) {
                        const g = studentData.gender.toLowerCase();
                        ageParts.push(g === 'f' || g === 'female' ? 'Girl' : g === 'm' || g === 'male' ? 'Boy' : studentData.gender);
                    }
                    studentDetails.textContent = ageParts.join(' \u00B7 ');

                    const profileImageSrc = studentData.profileImage || '/images/placeholder-student.jpg';
                    studentImage.src = profileImageSrc;
                    studentImage.alt = studentData.full_name || 'Student';

                    studentImage.onerror = function() {
                        this.src = '/images/placeholder-student.jpg';
                    };

                    modalStudentName.textContent = studentData.full_name || studentData.name || params.studentName;

                    if (isRescheduling && meetingId) {
                        fetchMeetingDetails(meetingId);
                    }
                })
                .catch(error => {
                    console.error('Error loading student data:', error);
                    showNotification('Failed to load student data. Please try again.', 'error');
                });
        }
        
        function fetchMeetingDetails(meetingId) {
            TalkTimeAuth.authenticatedRequest(`/api/v1/meetings/${meetingId}`, {
                method: 'GET'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Pre-select the date and time from the meeting
                    const meetingDate = new Date(data.meeting.scheduled_time);

                    // Extract EAT date/time components — timezone-safe for international volunteers
                    const eatYear = parseInt(meetingDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', year: 'numeric' }));
                    const eatMonth = parseInt(meetingDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', month: 'numeric' })) - 1;
                    const eatDay = parseInt(meetingDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', day: 'numeric' }));
                    const eatHour = parseInt(meetingDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }));
                    const eatMinute = parseInt(meetingDate.toLocaleString('en-US', { timeZone: 'Africa/Nairobi', minute: '2-digit' }));

                    // Volunteer's local time for display matching
                    const volHour = parseInt(meetingDate.toLocaleString('en-US', { timeZone: volunteerTimezone, hour: '2-digit', hour12: false }));
                    const volMinute = parseInt(meetingDate.toLocaleString('en-US', { timeZone: volunteerTimezone, minute: '2-digit' }));

                    // Set calendar month/year and selectedDate BEFORE rendering
                    // so renderCalendar() highlights the correct day
                    currentMonth = eatMonth;
                    currentYear = eatYear;
                    selectedDate = new Date(eatYear, eatMonth, eatDay);

                    // Render calendar (will highlight selectedDate) then show time slots
                    renderCalendar();
                    const slotsReady = showTimeSelection();

                    // Set selectedTimeSlot with both volunteer-local and EAT components
                    selectedTimeSlot = {
                        hour: volHour,
                        minute: volMinute,
                        eatHour: eatHour,
                        eatMinute: eatMinute
                    };

                    // Highlight the meeting's current slot once slots are actually
                    // rendered (was a 100ms timeout that lost the race on slow links)
                    Promise.resolve(slotsReady).then(() => {
                        const timeSlotElements = document.querySelectorAll('.time-slot');
                        timeSlotElements.forEach(slot => {
                            if (parseInt(slot.dataset.eatHour) === eatHour && parseInt(slot.dataset.eatMinute) === eatMinute) {
                                slot.classList.add('time-selected');
                                confirmContainer.classList.remove('hidden');
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('Error loading meeting details:', error);
                    showNotification('Failed to load meeting details. Please try again.', 'error');
                });
        }
        
        function checkMeetingLimitStatus(studentId) {
            // Check meeting count with this student and display status
            TalkTimeAuth.authenticatedRequest(`/api/v1/meetings/student/${studentId}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    const meetingStats = data.meetingStats || {};
                    const meetingCount = meetingStats.volunteerStudentMeetingCount || 0;
                    const limit = meetingStats.meetingLimit || 3;
                    const canScheduleMore = meetingStats.canScheduleMore !== false;
                    
                    // Update meeting limit placeholder with simple text
                    const statusEl = document.getElementById('meeting-limit-status');
                    const sFirstName = (studentName.textContent || '').trim().split(' ')[0] || 'this student';
                    if (statusEl) {
                        statusEl.innerHTML = `
                            <p class="text-xs font-medium ${canScheduleMore ? 'text-gray-500' : 'text-red-600'}">
                                <i class="fas ${canScheduleMore ? 'fa-check-circle text-green-500' : 'fa-exclamation-triangle text-red-500'} mr-1"></i>
                                Meeting Limit: ${meetingCount}/${limit} meetings with ${sFirstName}
                            </p>
                            <p class="text-xs ${canScheduleMore ? 'text-gray-400' : 'text-red-400'}" style="margin-top:2px;padding-left:18px;">
                                ${canScheduleMore
                                    ? `You can schedule ${limit - meetingCount} more meeting${limit - meetingCount === 1 ? '' : 's'}.`
                                    : 'Limit reached. Ensures equal opportunities for all students.'}
                            </p>
                        `;
                    }
                    
                    // If limit reached, disable scheduling interface
                    if (!canScheduleMore && !isRescheduling) {
                        disableSchedulingInterface();
                    }
                })
                .catch(error => {
                    console.error('Error checking meeting limit:', error);
                    // Don't block scheduling on error, just log it
                });
        }
        
        function disableSchedulingInterface() {
            // Disable calendar and time selection
            const calendarDays = document.getElementById('calendar-days');
            const timeSelection = document.getElementById('time-selection');
            const confirmContainer = document.getElementById('confirm-container');
            
            if (calendarDays) {
                calendarDays.style.pointerEvents = 'none';
                calendarDays.style.opacity = '0.5';
            }
            if (timeSelection) {
                timeSelection.style.display = 'none';
            }
            if (confirmContainer) {
                confirmContainer.style.display = 'none';
            }
            
            // Show disabled message
            const scheduleContainer = document.querySelector('.glass-bg');
            if (scheduleContainer) {
                const disabledMsg = document.createElement('div');
                disabledMsg.className = 'p-4 bg-gray-100 rounded-lg text-center mt-4';
                disabledMsg.innerHTML = `
                    <p class="text-gray-700">
                        <i class="fas fa-ban mr-2"></i>
                        Scheduling is disabled because you've reached the 3-meeting limit with this student.
                    </p>
                    <p class="text-sm text-gray-600 mt-2">
                        This policy ensures all students get equal opportunities to practice with different volunteers.
                    </p>
                `;
                scheduleContainer.appendChild(disabledMsg);
            }
        }
        
        function loadVolunteerTimezone() {
            // Fetch volunteer's profile to get their saved timezone
            TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile', {
                method: 'GET'
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Extract timezone from volunteer profile - handle both data structures
                    const previousTimezone = volunteerTimezone;
                    volunteerTimezone = data.timezone || data.volunteer?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                    // Display timezone with user-friendly format
                    const displayTimezone = formatTimezoneDisplay(volunteerTimezone);
                    volunteerTimezoneDisplay.textContent = displayTimezone;

                    // Show detection hint if timezone doesn't match browser timezone
                    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    if (volunteerTimezone !== browserTimezone) {
                        console.log(`Timezone mismatch detected. Saved: ${volunteerTimezone}, Browser: ${browserTimezone}`);
                    }

                    // If slots were already rendered with the browser timezone before the
                    // saved timezone arrived, re-render them in the correct zone
                    if (previousTimezone !== volunteerTimezone && selectedDate) {
                        generateTimeSlots();
                    }

                    console.log('Loaded volunteer timezone:', volunteerTimezone);
                })
                .catch(error => {
                    console.error('Error loading volunteer timezone:', error);
                    // Fallback to browser detected timezone
                    volunteerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const displayTimezone = formatTimezoneDisplay(volunteerTimezone);
                    volunteerTimezoneDisplay.textContent = displayTimezone + ' (detected)';
                });
        }

        // Exposed for the Auto-detect button: updates the closure variable the slot
        // engine actually uses, re-renders slots, and persists the change
        window.setVolunteerTimezone = function(tz) {
            volunteerTimezone = tz;
            volunteerTimezoneDisplay.textContent = formatTimezoneDisplay(tz) + ' (auto-detected)';
            if (selectedDate) {
                generateTimeSlots();
            }
            window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile', {
                method: 'PUT',
                body: JSON.stringify({ timezone: tz })
            }).catch(err => console.error('Failed to persist timezone:', err));
        };
        
        function formatTimezoneDisplay(timezone) {
            try {
                const now = new Date();
                const tzString = now.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'short' }).split(' ').pop();
                
                // Map common timezones to user-friendly names
                const timezoneMap = {
                    'America/New_York': 'Eastern Time (US & Canada)',
                    'America/Chicago': 'Central Time (US & Canada)',
                    'America/Denver': 'Mountain Time (US & Canada)',
                    'America/Los_Angeles': 'Pacific Time (US & Canada)',
                    'America/Toronto': 'Toronto, Montreal',
                    'Europe/London': 'London, Dublin',
                    'Europe/Paris': 'Paris, Berlin, Rome',
                    'Africa/Nairobi': 'Nairobi, Kenya (EAT)',
                    'Asia/Dubai': 'Dubai, Abu Dhabi',
                    'Asia/Tokyo': 'Tokyo, Osaka',
                    'Australia/Sydney': 'Sydney, Melbourne'
                };
                
                return timezoneMap[timezone] || `${timezone.replace('_', ' ')} (${tzString})`;
            } catch (e) {
                return timezone.replace('_', ' ');
            }
        }
        
        // --- Event Handlers ---
        prevMonthBtn.addEventListener('click', () => {
            // Don't allow going to past months
            const today = new Date();
            if (currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
                return;
            }
            
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
        
        nextMonthBtn.addEventListener('click', () => {
            // Calculate 3-month limit from today
            const today = new Date();
            const threeMonthsFromToday = new Date(today);
            threeMonthsFromToday.setMonth(today.getMonth() + 3);
            
            // Check if next month would exceed 3-month window
            let nextMonth = currentMonth + 1;
            let nextYear = currentYear;
            if (nextMonth > 11) {
                nextMonth = 0;
                nextYear++;
            }
            
            const nextMonthDate = new Date(nextYear, nextMonth, 1);
            if (nextMonthDate > threeMonthsFromToday) {
                return; // Don't allow navigation beyond 3-month window
            }
            
            currentMonth = nextMonth;
            currentYear = nextYear;
            renderCalendar();
        });
        
        confirmBtn.addEventListener('click', () => {
            if (!selectedDate || !selectedTimeSlot) {
                showNotification('Please select a date and time', 'error');
                return;
            }

            // In manual mode, ensure student data is loaded before showing confirmation
            if (!isAutoAssignMode && (!studentData || !studentData.id)) {
                showNotification('Loading student data... Please wait.', 'warning');
                return;
            }

            // Use the timezone-safe date object from the slot
            const meetingDate = selectedTimeSlot.date
                ? new Date(selectedTimeSlot.date)
                : new Date(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}T${String(selectedTimeSlot.eatHour||selectedTimeSlot.hour).padStart(2,'0')}:${String(selectedTimeSlot.eatMinute||selectedTimeSlot.minute).padStart(2,'0')}:00+03:00`);

            // Update modal with date and time including timezone label
            modalDate.textContent = formatDate(meetingDate);
            const volTzAbbr = meetingDate.toLocaleString('en-US', { timeZone: volunteerTimezone, timeZoneName: 'short' }).split(' ').pop();
            modalTime.textContent = `${formatTime(selectedTimeSlot.hour, selectedTimeSlot.minute)} (${volTzAbbr})`;

            // Populate Kenya Time (EAT) in modal
            const eatH = selectedTimeSlot.eatHour != null ? selectedTimeSlot.eatHour : selectedTimeSlot.hour;
            const eatM = selectedTimeSlot.eatMinute != null ? selectedTimeSlot.eatMinute : selectedTimeSlot.minute;
            const modalTimeEat = document.getElementById('modal-time-eat');
            if (modalTimeEat) {
                modalTimeEat.textContent = formatTime(eatH, eatM);
            }

            // Show confirmation modal
            confirmModal.classList.remove('hidden');
        });
        
        modalCancel.addEventListener('click', () => {
            confirmModal.classList.add('hidden');
        });
        
        let bookingInFlight = false;
        modalConfirm.addEventListener('click', () => {
            // Guard against double-click creating duplicate meetings
            if (bookingInFlight) return;
            bookingInFlight = true;
            modalConfirm.disabled = true;
            setTimeout(() => { bookingInFlight = false; modalConfirm.disabled = false; }, 8000);

            // Hide modal
            confirmModal.classList.add('hidden');

            // Get student ID from URL (may be null for auto-assign)
            const params = getUrlParams();

            // In manual mode, ensure student data is loaded
            if (!isAutoAssignMode && (!studentData || !studentData.id)) {
                showNotification('Student data not loaded yet. Please wait and try again.', 'error');
                return;
            }

            // Build meeting time from EAT hours with explicit +03:00 offset
            let meetingDate;
            if (selectedTimeSlot.date) {
                meetingDate = new Date(selectedTimeSlot.date);
            } else {
                const yr = selectedDate.getFullYear();
                const mo = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const dy = String(selectedDate.getDate()).padStart(2, '0');
                const hr = String(selectedTimeSlot.eatHour != null ? selectedTimeSlot.eatHour : selectedTimeSlot.hour).padStart(2, '0');
                const mi = String(selectedTimeSlot.eatMinute != null ? selectedTimeSlot.eatMinute : selectedTimeSlot.minute).padStart(2, '0');
                meetingDate = new Date(`${yr}-${mo}-${dy}T${hr}:${mi}:00+03:00`);
            }

            const timezone = volunteerTimezone;

            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const eatH = selectedTimeSlot.eatHour != null ? selectedTimeSlot.eatHour : selectedTimeSlot.hour;
            const eatM = selectedTimeSlot.eatMinute != null ? selectedTimeSlot.eatMinute : selectedTimeSlot.minute;
            const timeStr = `${String(eatH).padStart(2, '0')}:${String(eatM).padStart(2, '0')}`;

            // Prepare meeting data — omit studentId for auto-assign mode
            const meetingData = {
                date: dateStr,
                time: timeStr,
                timezone: timezone,
                scheduledTime: meetingDate.toISOString(),
                eatTime: {
                    hour: selectedTimeSlot.eatHour != null ? selectedTimeSlot.eatHour : selectedTimeSlot.hour,
                    minute: selectedTimeSlot.eatMinute != null ? selectedTimeSlot.eatMinute : selectedTimeSlot.minute
                }
            };

            // Include studentId only in manual mode
            if (!isAutoAssignMode && studentData && studentData.id) {
                meetingData.studentId = studentData.id;
            }

            console.log('Sending meeting data:', isAutoAssignMode ? '(auto-assign)' : 'studentId=' + meetingData.studentId);

            let endpoint = '/api/v1/volunteers/meetings';
            let method = 'POST';

            if (isRescheduling && meetingId) {
                endpoint = `/api/v1/meetings/${meetingId}`;
                method = 'PUT';
            }

            TalkTimeAuth.authenticatedRequest(endpoint, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(meetingData)
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(errorData => {
                            console.log('Server error response:', errorData);
                            if (response.status === 403) {
                                if (errorData.error && errorData.error.includes('3-meeting limit')) {
                                    throw new Error('You have reached the 3-meeting limit with this student. This ensures all students get equal opportunities.');
                                } else if (errorData.error && errorData.error.includes('restricted')) {
                                    showRestrictionModal(errorData);
                                    return;
                                } else {
                                    throw new Error(errorData.message || errorData.error || 'Access denied');
                                }
                            } else if (response.status === 409) {
                                // Handle auto-assign NO_STUDENT_AVAILABLE
                                if (errorData.code === 'NO_STUDENT_AVAILABLE') {
                                    throw new Error('All students are booked for this time. Please try a different date or time.');
                                }
                                if (errorData.code === 'SLOT_CAPACITY_REACHED') {
                                    throw new Error('This time slot is fully booked. Please choose a different time.');
                                }
                                throw new Error(errorData.error || 'Time slot conflict. Please choose a different date or time.');
                            } else {
                                throw new Error(errorData.error || 'Failed to schedule meeting');
                            }
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data) return; // Restriction modal handled it
                    // Check if this was an auto-assigned meeting
                    if (data.meeting && data.meeting.autoAssigned) {
                        const assignedName = data.meeting.student ? data.meeting.student.name : 'a student';
                        showNotification('Meeting scheduled with ' + assignedName + '!');

                        // Show recurring prompt instead of immediately redirecting
                        const eatH = selectedTimeSlot.eatHour != null ? selectedTimeSlot.eatHour : selectedTimeSlot.hour;
                        const eatM = selectedTimeSlot.eatMinute != null ? selectedTimeSlot.eatMinute : selectedTimeSlot.minute;
                        showRecurringPrompt(eatH, eatM);
                        return;
                    }

                    // Manual mode: existing behavior
                    showNotification(isRescheduling ? 'Meeting rescheduled successfully' : 'Meeting scheduled successfully');

                    if (isRescheduling) {
                        if (document.dispatchEvent) {
                            document.dispatchEvent(new CustomEvent('talktimeNotificationSent', {
                                detail: {
                                    type: 'meeting_rescheduled',
                                    priority: 'high',
                                    metadata: { meeting_id: meetingId, action: 'reschedule_confirmed' },
                                    source: 'schedule_page',
                                    force_play: true
                                }
                            }));
                        }
                        if (window.talkTimeNotificationSoundManager) {
                            window.talkTimeNotificationSoundManager.playSound('meeting_rescheduled', {
                                forcePlay: true,
                                source: 'schedule_confirmation'
                            }).catch(function() {});
                        }
                        if (window.realtimeNotifications && window.realtimeNotifications.playNotificationSound) {
                            window.realtimeNotifications.playNotificationSound({
                                sound_type: 'meeting_rescheduled',
                                priority: 'high',
                                notification: { type: 'meeting_rescheduled' },
                                source: 'schedule_confirmation'
                            });
                        }
                    }

                    const redirectDelay = isRescheduling ? 3000 : 1500;

                    if (params) {
                        setTimeout(() => {
                            window.location.href = `/volunteer/dashboard/student-detail.html?id=${params.studentId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}`;
                        }, redirectDelay);
                    } else {
                        setTimeout(() => {
                            window.location.href = '/volunteer/dashboard/students';
                        }, redirectDelay);
                    }
                })
                .catch(error => {
                    console.error('Error scheduling meeting:', error);
                    showNotification(error.message || 'Failed to schedule meeting. Please try again.', 'error');
                });
        });
        
        // --- Recurring Schedule Prompt ---
        function showRecurringPrompt(eatH, eatM) {
            const recurringModal = document.getElementById('recurring-modal');
            const timeDisplay = document.getElementById('recurring-time-display');
            if (!recurringModal) return;

            // Format EAT time for display
            const period = eatH >= 12 ? 'PM' : 'AM';
            const displayH = eatH % 12 || 12;
            timeDisplay.textContent = `${displayH}:${String(eatM).padStart(2, '0')} ${period} EAT`;

            // Store EAT time on the modal for the confirm handler
            recurringModal.dataset.eatHour = eatH;
            recurringModal.dataset.eatMinute = eatM;

            // Reset checkboxes
            document.querySelectorAll('.recurring-day-cb').forEach(cb => cb.checked = false);
            document.getElementById('recurring-all-days').checked = false;

            recurringModal.classList.remove('hidden');
        }

        // "Every day" toggle
        const recurringAllDays = document.getElementById('recurring-all-days');
        if (recurringAllDays) {
            recurringAllDays.addEventListener('change', (e) => {
                document.querySelectorAll('.recurring-day-cb').forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }

        // Individual day checkbox — uncheck "all days" if any single day is unchecked
        document.querySelectorAll('.recurring-day-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(document.querySelectorAll('.recurring-day-cb')).every(c => c.checked);
                document.getElementById('recurring-all-days').checked = allChecked;
            });
        });

        // Skip button
        const recurringSkip = document.getElementById('recurring-skip');
        if (recurringSkip) {
            recurringSkip.addEventListener('click', () => {
                document.getElementById('recurring-modal').classList.add('hidden');
                window.location.href = '/volunteer/dashboard/students';
            });
        }

        // Confirm recurring schedule
        const recurringConfirmBtn = document.getElementById('recurring-confirm');
        if (recurringConfirmBtn) {
            recurringConfirmBtn.addEventListener('click', () => {
                const selectedDays = Array.from(document.querySelectorAll('.recurring-day-cb:checked')).map(cb => parseInt(cb.value));

                if (selectedDays.length === 0) {
                    showNotification('Please select at least one day.', 'error');
                    return;
                }

                const modal = document.getElementById('recurring-modal');
                const eatH = parseInt(modal.dataset.eatHour);
                const eatM = parseInt(modal.dataset.eatMinute);
                const timeSlot = `${String(eatH).padStart(2, '0')}:${String(eatM).padStart(2, '0')}:00`;

                recurringConfirmBtn.disabled = true;
                recurringConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';

                TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/recurring-schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ time_slot: timeSlot, days_of_week: selectedDays })
                })
                .then(response => {
                    if (!response.ok) return response.json().then(d => { throw new Error(d.error || 'Failed'); });
                    return response.json();
                })
                .then(() => {
                    showNotification('Recurring schedule created!');
                    modal.classList.add('hidden');
                    setTimeout(() => {
                        window.location.href = '/volunteer/dashboard/students';
                    }, 1500);
                })
                .catch(err => {
                    showNotification(err.message || 'Failed to create recurring schedule.', 'error');
                    recurringConfirmBtn.disabled = false;
                    recurringConfirmBtn.innerHTML = 'Set Recurring';
                });
            });
        }

        // --- Initialize Authentication ---
        window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
        
        // --- Initialize Real-time Notifications ---
        if (typeof RealtimeNotifications !== 'undefined') {
            window.realtimeNotifications = new RealtimeNotifications('volunteer');
            window.realtimeNotifications.initialize().then(() => {
                console.log('Real-time notifications initialized on schedule page');
                
                // Listen for meeting notifications
                window.realtimeNotifications.on('newNotification', (notification) => {
                    if (notification.type === 'meeting_scheduled' || notification.type === 'meeting_rescheduled') {
                        console.log('Meeting notification received:', notification);
                        showNotification(notification.message, 'success');
                    }
                });
                
                // Add specific listener for meeting-rescheduled Socket.IO events
                if (window.realtimeNotifications.socket) {
                    window.realtimeNotifications.socket.on('meeting-rescheduled', (data) => {
                        console.log('🔔 Schedule page received meeting-rescheduled event:', data);
                        
                        // Trigger reschedule sound
                        if (window.realtimeNotifications.playNotificationSound) {
                            window.realtimeNotifications.playNotificationSound({
                                sound_type: 'meeting_rescheduled',
                                priority: 'high',
                                notification: { type: 'meeting_rescheduled' },
                                metadata: data,
                                source: 'socket_event_schedule_page'
                            });
                        }
                        
                        // Show toast notification
                        showNotification('Meeting rescheduled successfully! 🔔', 'success');
                    });
                } else {
                    console.log('Socket.IO not available on schedule page, manual sound triggers will be used');
                }
            }).catch(error => {
                console.error('Failed to initialize real-time notifications:', error);
            });
        }
        
        // --- Initialization ---
        loadStudentData();
        renderCalendar();

        // Auto-select today's date
        const todayDate = new Date();
        const todayCell = document.querySelector('.day-today:not(.day-disabled)');
        if (todayCell) {
            todayCell.classList.add('day-selected');
            selectedDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
            showTimeSelection();
        }
    });
    