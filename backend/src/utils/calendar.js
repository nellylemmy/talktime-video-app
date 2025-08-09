import Meeting from '../models/Meeting.js';

/**
 * Generates HTML for a monthly calendar.
 * @param {number} year - The full year (e.g., 2024).
 * @param {number} month - The month index (0-11).
 * @param {number} studentId - The ID of the student to generate the calendar for.
 * @returns {string} The HTML string for the calendar.
 */
async function generateCalendarHtml(year, month, studentId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to the start of the day

    const bookedSlots = await Meeting.findBookedSlotsByStudent(studentId, year, month);
    // For simplicity, we'll treat any day with a booking as fully unavailable for now.
    const bookedDates = new Set(bookedSlots.map(slot => new Date(slot.setHours(0,0,0,0)).toISOString()));

    const date = new Date(year, month, 1);
    const monthName = date.toLocaleString('default', { month: 'long' });
    const fullYear = date.getFullYear();

    const prevMonth = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month + 1, 1);

    let html = `
        <div class="flex items-center justify-between mb-4">
            <button hx-get="/volunteer/schedule/${studentId}/calendar?month=${prevMonth.getMonth()}&year=${prevMonth.getFullYear()}"
                    hx-target="#calendar-container"
                    hx-swap="innerHTML"
                    class="p-2 rounded-full hover:bg-gray-100">
                &lt;
            </button>
            <h3 class="text-lg font-bold">${monthName} ${fullYear}</h3>
            <button hx-get="/volunteer/schedule/${studentId}/calendar?month=${nextMonth.getMonth()}&year=${nextMonth.getFullYear()}"
                    hx-target="#calendar-container"
                    hx-swap="innerHTML"
                    class="p-2 rounded-full hover:bg-gray-100">
                &gt;
            </button>
        </div>
        <div class="grid grid-cols-7 gap-2 text-center text-sm">
            <div class="font-semibold text-gray-600">Sun</div>
            <div class="font-semibold text-gray-600">Mon</div>
            <div class="font-semibold text-gray-600">Tue</div>
            <div class="font-semibold text-gray-600">Wed</div>
            <div class="font-semibold text-gray-600">Thu</div>
            <div class="font-semibold text-gray-600">Fri</div>
            <div class="font-semibold text-gray-600">Sat</div>
    `;

    const firstDayOfMonth = date.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
        html += '<div></div>';
    }

    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const isPast = currentDate < today;
        const isBooked = bookedDates.has(currentDate.toISOString());

        let dayClass = 'p-2';
        let hxAttrs = '';

        if (isPast || isBooked) {
            dayClass += ' text-gray-400'; // Mark past or booked days as unavailable
        } else {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dayClass += ' cursor-pointer bg-teal-50 hover:bg-teal-200 rounded-full';
            hxAttrs = `hx-get="/volunteer/schedule/${studentId}/times?date=${dateString}" hx-target="#time-slot-container" hx-swap="innerHTML"`;
        }

        html += `<div class="${dayClass}" ${hxAttrs}>${day}</div>`;
    }

    html += '</div>'; // Close grid
    return html;
}

export { generateCalendarHtml };
