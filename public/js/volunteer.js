document.addEventListener('DOMContentLoaded', () => {
    const studentListContainer = document.getElementById('student-list-container');

    if (!studentListContainer) {
        console.error('Student list container not found.');
        return;
    }

    // Fetch student data and render the list
    fetch('/data.json')
        .then(response => response.json())
        .then(data => {
            const students = data.users.students;
            if (!students || students.length === 0) {
                studentListContainer.innerHTML = '<p class="text-center text-gray-500">No students found.</p>';
                return;
            }

            students.forEach(student => {
                const studentCard = document.createElement('div');
                studentCard.className = 'p-4 border rounded-lg flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors';
                studentCard.innerHTML = `
                    <div>
                        <p class="font-semibold">${student.name}</p>
                        <p class="text-sm text-gray-600">${student.country}</p>
                    </div>
                    <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Call</button>
                `;

                studentCard.addEventListener('click', () => createCallWithStudent(student));
                studentListContainer.appendChild(studentCard);
            });
        })
        .catch(error => {
            console.error('Error fetching student data:', error);
            studentListContainer.innerHTML = '<p class="text-center text-red-500">Failed to load student data.</p>';
        });

    function createCallWithStudent(student) {
        // Generate a unique room name
        const randomChars = Math.random().toString(36).substring(2, 10);
        const roomName = `ADEA-talktime-${randomChars}`;

        // Store information for the call page
        sessionStorage.setItem('userRole', 'volunteer');
        sessionStorage.setItem('studentToCall', student.name);

        // Redirect to the call page
        const params = new URLSearchParams({
            room: roomName,
            role: 'volunteer'
        });
        window.location.href = `call.html?${params.toString()}`;
    }
});
