document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('main-header');
    const modal = document.getElementById('coming-soon-modal');
    const modalContent = modal.querySelector('.modal-content');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const openModalTriggers = document.querySelectorAll('.coming-soon-trigger');

    // --- Header Scroll Logic ---
    const handleScroll = () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    };
    window.addEventListener('scroll', handleScroll);

    // --- Modal Logic ---
    const openModal = (e) => {
        e.preventDefault();
        modal.classList.remove('hidden');
        setTimeout(() => { // Allow display property to apply before starting transition
            modal.classList.add('opacity-100');
            modalContent.classList.add('scale-100');
            modalContent.classList.remove('scale-95');
        }, 10);
    };

    const closeModal = () => {
        modal.classList.remove('opacity-100');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        setTimeout(() => { // Wait for transition to finish before hiding
            modal.classList.add('hidden');
        }, 300); 
    };
    
    // Only attach modal logic to buttons that aren't for main app flow
    openModalTriggers.forEach(trigger => {
        trigger.addEventListener('click', openModal);
    });

    closeModalBtn.addEventListener('click', closeModal);
    // Close modal by clicking on the overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
});
