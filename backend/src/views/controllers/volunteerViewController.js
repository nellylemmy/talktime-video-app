/**
 * Volunteer View Controller
 * Handles rendering HTML views for volunteer-related pages
 * Consumes the API endpoints and transforms JSON data into HTML
 */
import axios from 'axios';

/**
 * Render student cards HTML from API data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const renderStudentCards = async (req, res) => {
    try {
        // Make internal API call to get student data
        // In a real implementation, we would use a proper API client
        // This is a simplified example using axios to call our own API
        const apiUrl = `${req.protocol}://${req.get('host')}/api/v1/volunteers/students`;
        const response = await axios.get(apiUrl, {
            headers: {
                'Cookie': req.headers.cookie // Pass session cookies for authentication
            }
        });
        
        const { data } = response;
        
        if (!data.data || data.data.length === 0) {
            return res.send('<p class="text-gray-500 text-center py-4">No students available at this time.</p>');
        }
        
        // Generate HTML for student cards
        let html = '';
        
        for (const student of data.data) {
            // Determine interests or status text
            const interests = student.interests || 'English conversation practice';
            
            // Generate a random color for the avatar background
            const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            
            // Determine whether to show an image or a colored initial avatar
            const avatarHTML = student.photo_url ? 
                `<img src="${student.photo_url}" alt="${student.full_name}" class="w-12 h-12 rounded-full object-cover border-2 border-white/50">` : 
                `<div class="w-12 h-12 rounded-full ${randomColor} flex items-center justify-center text-white font-bold border-2 border-white/50">${student.initial}</div>`;
            
            html += `
                <a href="#" data-student-id="${student.id}" 
                   class="glass-bg p-4 rounded-xl flex items-center gap-4 transition-all hover:shadow-lg cursor-pointer hover:-translate-y-1">
                    ${avatarHTML}
                    <div class="flex-1">
                        <p class="font-semibold">${student.full_name}</p>
                        <p class="text-xs text-gray-600">${interests}</p>
                    </div>
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </a>
            `;
        }
        
        res.send(html);
    } catch (error) {
        console.error('Error rendering student cards:', error);
        res.status(500).send('<p class="text-red-500 text-center">Failed to load student data.</p>');
    }
};
