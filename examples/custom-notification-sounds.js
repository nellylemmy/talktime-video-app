/**
 * Example: Adding Custom JavaScript Sounds to TalkTime Notification System
 * 
 * This file demonstrates how to integrate custom sound files or 
 * JavaScript-generated sounds with the TalkTime notification system.
 */

// Example 1: Using Audio Files
// If you have sound files (mp3, wav, etc.), you can add them like this:

function addCustomSoundFile() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) {
        console.error('Sound manager not available');
        return;
    }

    // Method 1: Simple audio file
    const customAudio = new Audio('/sounds/custom-notification.mp3');
    customAudio.volume = 0.7;
    
    // Add to sound manager
    soundManager.addCustomSound('custom_file', {
        audioElement: customAudio,
        volume: 0.7,
        repeat: 1
    });
}

// Example 2: JavaScript-generated Sounds using Web Audio API
// Create complex sounds programmatically

function addCustomGeneratedSound() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) {
        console.error('Sound manager not available');
        return;
    }

    // Add a custom melody
    soundManager.addCustomSound('custom_melody', {
        frequencies: [523, 659, 784, 1047], // C, E, G, C (major chord)
        duration: 150,
        volume: 0.6,
        type: 'sine',
        envelope: 'fade',
        gap: 100 // Time between notes
    });

    // Add a drum-like sound
    soundManager.addCustomSound('custom_drum', {
        frequency: 60,
        duration: 100,
        volume: 0.8,
        type: 'sawtooth',
        envelope: 'sharp_decay',
        repeat: 2,
        gap: 50
    });
}

// Example 3: Using Base64 Encoded Audio
// If you have a short sound encoded as base64

function addBase64Sound() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) {
        console.error('Sound manager not available');
        return;
    }

    // Example base64 audio (replace with your own)
    const base64Audio = `data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+LyvmgdBjCa3O/DfU0HIIvT8NSGOwgNZJDT8daCQAkWE`;
    
    const audio = new Audio(base64Audio);
    audio.volume = 0.5;
    
    soundManager.addCustomSound('custom_base64', {
        audioElement: audio,
        volume: 0.5,
        repeat: 1
    });
}

// Example 4: Advanced Custom Sound with Multiple Layers
// Create a complex notification sound with multiple frequency layers

function addAdvancedCustomSound() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) {
        console.error('Sound manager not available');
        return;
    }

    // Define a complex sound with multiple tones
    soundManager.addCustomSound('advanced_notification', {
        layers: [
            {
                frequency: 800,
                duration: 300,
                volume: 0.4,
                type: 'sine',
                envelope: 'fade'
            },
            {
                frequency: 1200,
                duration: 200,
                volume: 0.3,
                type: 'triangle',
                envelope: 'pulse',
                delay: 100 // Start 100ms after the first layer
            },
            {
                frequency: 400,
                duration: 500,
                volume: 0.2,
                type: 'square',
                envelope: 'gentle',
                delay: 200
            }
        ]
    });
}

// Example 5: Using the Web Audio API directly for custom effects

async function createCustomWebAudioSound() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager || !soundManager.audioContext) {
        console.error('Web Audio not available');
        return;
    }

    const audioContext = soundManager.audioContext;
    
    // Create a custom sound function
    const playCustomSound = async () => {
        // Create oscillator for main tone
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // Create filter for sound shaping
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, audioContext.currentTime);
        
        // Connect the audio graph
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configure the oscillator
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
        oscillator.frequency.exponentialRampToValueAtTime(220, audioContext.currentTime + 0.3);
        
        // Configure the envelope
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        // Add some filter movement
        filter.frequency.setValueAtTime(2000, audioContext.currentTime);
        filter.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.4);
        
        // Play the sound
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
    };
    
    // Add to sound manager
    soundManager.addCustomSound('web_audio_custom', {
        customFunction: playCustomSound,
        duration: 400
    });
}

// Example 6: Creating Notification Sound Sets for Different Themes

function addThemeSounds() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) {
        console.error('Sound manager not available');
        return;
    }

    // Gentle/Calming Theme
    soundManager.addCustomSound('gentle_chime', {
        frequency: 528, // "Love frequency"
        duration: 400,
        volume: 0.4,
        type: 'sine',
        envelope: 'gentle'
    });

    // Energetic/Upbeat Theme
    soundManager.addCustomSound('upbeat_ding', {
        frequency: 1000,
        duration: 150,
        volume: 0.6,
        type: 'triangle',
        envelope: 'sharp',
        repeat: 2,
        gap: 100
    });

    // Professional/Business Theme
    soundManager.addCustomSound('business_tone', {
        frequency: 600,
        duration: 250,
        volume: 0.5,
        type: 'sine',
        envelope: 'professional'
    });

    // Fun/Playful Theme
    soundManager.addCustomSound('playful_bounce', {
        frequencies: [440, 554, 659], // A, C#, E (A major chord)
        duration: 100,
        volume: 0.5,
        type: 'square',
        envelope: 'bounce',
        gap: 50
    });
}

// Example 7: Integrating with Existing Notifications

function integrateCustomSounds() {
    // Wait for notification events and play custom sounds
    document.addEventListener('talktimeNotificationSent', (event) => {
        const { type, priority } = event.detail;
        
        // Play different custom sounds based on notification type
        switch (type) {
            case 'meeting_reminder':
                playCustomSound('gentle_chime');
                break;
            case 'instant_call':
                playCustomSound('upbeat_ding');
                break;
            case 'meeting_scheduled':
                playCustomSound('business_tone');
                break;
            case 'system':
                playCustomSound('playful_bounce');
                break;
            default:
                playCustomSound('custom_melody');
        }
    });
}

async function playCustomSound(soundType) {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (soundManager) {
        try {
            await soundManager.playSound(soundType, { forcePlay: true });
        } catch (error) {
            console.error('Error playing custom sound:', error);
        }
    }
}

// Example 8: User Preference Integration

function setupUserSoundPreferences() {
    const soundManager = window.talkTimeNotificationSoundManager;
    if (!soundManager) return;

    // Get user's preferred theme from localStorage or user settings
    const userTheme = localStorage.getItem('talktime_sound_theme') || 'default';
    
    // Apply theme-specific sounds
    switch (userTheme) {
        case 'gentle':
            soundManager.addCustomSound('themed_notification', {
                frequency: 432,
                duration: 500,
                volume: 0.3,
                type: 'sine',
                envelope: 'gentle'
            });
            break;
        case 'energetic':
            soundManager.addCustomSound('themed_notification', {
                frequency: 800,
                duration: 200,
                volume: 0.7,
                type: 'square',
                envelope: 'sharp',
                repeat: 2,
                gap: 100
            });
            break;
        case 'professional':
            soundManager.addCustomSound('themed_notification', {
                frequency: 650,
                duration: 300,
                volume: 0.5,
                type: 'triangle',
                envelope: 'professional'
            });
            break;
    }
}

// Initialize all custom sounds when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for the sound manager to be ready
    document.addEventListener('talkTimeNotificationSoundReady', () => {
        console.log('🔊 Adding custom sounds...');
        
        // Add your custom sounds here
        addCustomGeneratedSound();
        addAdvancedCustomSound();
        addThemeSounds();
        
        // Setup integrations
        integrateCustomSounds();
        setupUserSoundPreferences();
        
        console.log('✅ Custom sounds added successfully');
    });
});

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
    window.TalkTimeCustomSounds = {
        addCustomSoundFile,
        addCustomGeneratedSound,
        addBase64Sound,
        addAdvancedCustomSound,
        createCustomWebAudioSound,
        addThemeSounds,
        playCustomSound,
        integrateCustomSounds,
        setupUserSoundPreferences
    };
}

/* 
Usage Examples:

1. To play a custom sound:
   playCustomSound('custom_melody');

2. To add a sound from an audio file:
   addCustomSoundFile();

3. To create a completely custom sound:
   createCustomWebAudioSound();

4. To integrate with notifications:
   integrateCustomSounds();

5. To test custom sounds:
   window.talkTimeNotificationSoundManager.testSound('custom_melody');
*/
