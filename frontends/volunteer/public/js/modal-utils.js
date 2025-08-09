/**
 * TalkTime Modal Utilities
 * Professional modal system with brand colors and animations
 */

class TalkTimeModal {
    constructor() {
        this.currentModal = null;
        this.init();
    }

    init() {
        // Ensure DOM is ready before creating container
        if (!document.body) {
            // If body is not ready, wait for DOM to load
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
                return;
            } else {
                // Fallback: wait a bit and try again
                setTimeout(() => this.init(), 10);
                return;
            }
        }

        // Create modal container if it doesn't exist
        if (!document.getElementById('talktime-modal-container')) {
            const container = document.createElement('div');
            container.id = 'talktime-modal-container';
            document.body.appendChild(container);
        }
    }

    /**
     * Show a notification modal
     * @param {string} message - The message to display
     * @param {string} type - Type: 'success', 'error', 'warning', 'info'
     * @param {Object} options - Additional options
     */
    showNotification(message, type = 'info', options = {}) {
        const {
            title = this.getDefaultTitle(type),
            autoClose = true,
            duration = 4000,
            showCloseButton = true
        } = options;

        const modal = this.createModal({
            title,
            message,
            type,
            showCloseButton,
            buttons: []
        });

        this.displayModal(modal);

        if (autoClose) {
            setTimeout(() => {
                this.closeModal();
            }, duration);
        }
    }

    /**
     * Show a confirmation modal
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    showConfirmation(message, options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm Action',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'warning'
            } = options;

            const modal = this.createModal({
                title,
                message,
                type,
                showCloseButton: true,
                buttons: [
                    {
                        text: cancelText,
                        class: 'btn-secondary',
                        action: () => {
                            this.closeModal();
                            resolve(false);
                        }
                    },
                    {
                        text: confirmText,
                        class: 'btn-primary',
                        action: () => {
                            this.closeModal();
                            resolve(true);
                        }
                    }
                ]
            });

            this.displayModal(modal);
        });
    }

    /**
     * Show an input modal
     * @param {string} message - The message to display
     * @param {Object} options - Additional options
     */
    showInput(message, options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Input Required',
                placeholder = 'Enter value...',
                defaultValue = '',
                confirmText = 'Submit',
                cancelText = 'Cancel',
                type = 'info',
                inputType = 'text'
            } = options;

            const inputId = 'talktime-modal-input-' + Date.now();
            const messageWithInput = `
                ${message}
                <div class="mt-4">
                    <input 
                        type="${inputType}" 
                        id="${inputId}" 
                        placeholder="${placeholder}" 
                        value="${defaultValue}"
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    />
                </div>
            `;

            const modal = this.createModal({
                title,
                message: messageWithInput,
                type,
                showCloseButton: true,
                buttons: [
                    {
                        text: cancelText,
                        class: 'btn-secondary',
                        action: () => {
                            this.closeModal();
                            resolve(null);
                        }
                    },
                    {
                        text: confirmText,
                        class: 'btn-primary',
                        action: () => {
                            const input = document.getElementById(inputId);
                            const value = input ? input.value.trim() : '';
                            this.closeModal();
                            resolve(value);
                        }
                    }
                ]
            });

            this.displayModal(modal);

            // Focus on input after modal is displayed
            setTimeout(() => {
                const input = document.getElementById(inputId);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
        });
    }

    createModal({ title, message, type, showCloseButton, buttons }) {
        const typeConfig = this.getTypeConfig(type);
        
        const modalHtml = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity duration-300" id="talktime-modal-overlay">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-95 opacity-0" id="talktime-modal-content">
                    <!-- Header -->
                    <div class="flex items-center justify-between p-6 border-b border-gray-100">
                        <div class="flex items-center space-x-3">
                            <div class="flex-shrink-0">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center ${typeConfig.bgColor}">
                                    <i class="${typeConfig.icon} ${typeConfig.iconColor}"></i>
                                </div>
                            </div>
                            <h3 class="text-lg font-semibold text-gray-900 font-poppins">${title}</h3>
                        </div>
                        ${showCloseButton ? `
                            <button class="text-gray-400 hover:text-gray-600 transition-colors" id="talktime-modal-close">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                    
                    <!-- Body -->
                    <div class="p-6">
                        <div class="text-gray-700 leading-relaxed">${message}</div>
                    </div>
                    
                    <!-- Footer -->
                    ${buttons.length > 0 ? `
                        <div class="flex justify-end space-x-3 p-6 pt-0">
                            ${buttons.map(button => `
                                <button class="px-6 py-2 rounded-lg font-medium transition-all duration-200 ${this.getButtonClass(button.class)}" data-action="${buttons.indexOf(button)}">
                                    ${button.text}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        return { html: modalHtml, buttons };
    }

    displayModal(modal) {
        // Ensure container exists before displaying modal
        this.init();
        
        const container = document.getElementById('talktime-modal-container');
        if (!container) {
            console.error('Modal container not available, falling back to alert');
            alert(modal.message || 'Notification');
            return;
        }
        
        container.innerHTML = modal.html;
        
        this.currentModal = modal;

        // Add event listeners
        const overlay = document.getElementById('talktime-modal-overlay');
        const content = document.getElementById('talktime-modal-content');
        const closeBtn = document.getElementById('talktime-modal-close');

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeModal();
            }
        });

        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Button actions
        modal.buttons.forEach((button, index) => {
            const btnElement = overlay.querySelector(`[data-action="${index}"]`);
            if (btnElement) {
                btnElement.addEventListener('click', button.action);
            }
        });

        // Escape key to close
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Animate in
        setTimeout(() => {
            overlay.classList.remove('bg-opacity-50');
            overlay.classList.add('bg-opacity-50');
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    }

    closeModal() {
        const overlay = document.getElementById('talktime-modal-overlay');
        const content = document.getElementById('talktime-modal-content');
        
        if (overlay && content) {
            // Animate out
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            overlay.classList.remove('bg-opacity-50');
            overlay.classList.add('bg-opacity-0');
            
            setTimeout(() => {
                const container = document.getElementById('talktime-modal-container');
                if (container) {
                    container.innerHTML = '';
                }
                this.currentModal = null;
            }, 300);
        }
    }

    getDefaultTitle(type) {
        const titles = {
            success: 'Success!',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        return titles[type] || 'Notification';
    }

    getTypeConfig(type) {
        const configs = {
            success: {
                icon: 'fas fa-check',
                iconColor: 'text-green-600',
                bgColor: 'bg-green-100'
            },
            error: {
                icon: 'fas fa-exclamation-triangle',
                iconColor: 'text-red-600',
                bgColor: 'bg-red-100'
            },
            warning: {
                icon: 'fas fa-exclamation-circle',
                iconColor: 'text-yellow-600',
                bgColor: 'bg-yellow-100'
            },
            info: {
                icon: 'fas fa-info-circle',
                iconColor: 'text-blue-600',
                bgColor: 'bg-blue-100'
            }
        };
        return configs[type] || configs.info;
    }

    getButtonClass(type) {
        const classes = {
            'btn-primary': 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5',
            'btn-secondary': 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300',
            'btn-success': 'bg-green-600 text-white hover:bg-green-700',
            'btn-danger': 'bg-red-600 text-white hover:bg-red-700'
        };
        return classes[type] || classes['btn-secondary'];
    }
}

// Create global instance
window.TalkTimeModal = new TalkTimeModal();

// Convenience functions for easy access
window.showNotification = (message, type, options) => window.TalkTimeModal.showNotification(message, type, options);
window.showConfirmation = (message, options) => window.TalkTimeModal.showConfirmation(message, options);
window.showInput = (message, options) => window.TalkTimeModal.showInput(message, options);
