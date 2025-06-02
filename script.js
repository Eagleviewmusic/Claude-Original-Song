document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const playBtn = document.getElementById('play-btn');
  const stopBtn = document.getElementById('stop-btn');
  const restartBtn = document.getElementById('restart-btn');
  const statusDisplay = document.getElementById('status-display');
  const statusText = statusDisplay.querySelector('.status-text');
  const progressBar = document.getElementById('progress-bar');
  const progressHandle = document.getElementById('progress-handle');
  const pianoVisualizer = document.getElementById('piano-visualizer');
  const waveformVisualizer = document.getElementById('waveform-visualizer');
  const voiceVolumeSlider = document.getElementById('voice-volume-slider');
  const instrumentVolumeSlider = document.getElementById('instrument-volume-slider');
  
  // State variables
  let audioContext = null;
  let masterGain = null;
  let compressor = null;
  let instrumentGain = null;
  let isPlaying = false;
  let activeOscillators = [];
  let timeoutIds = [];
  let activePianoKeys = [];
  let progressInterval = null;
  const songDuration = 45; // seconds
  
  // Create piano keys
  function createPianoKeys() {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octaves = [3, 4, 5];
    
    pianoVisualizer.innerHTML = '';
    
    octaves.forEach(octave => {
      notes.forEach(note => {
        const isBlack = note.includes('#');
        const keyElement = document.createElement('div');
        keyElement.className = `piano-key${isBlack ? ' black-key' : ''}`;
        keyElement.id = `key-${note.replace('#', 's')}${octave}`;
        
        const noteLabel = document.createElement('span');
        noteLabel.className = 'note-label';
        noteLabel.textContent = isBlack ? note.replace('#', '♯') : note;
        keyElement.appendChild(noteLabel);
        
        pianoVisualizer.appendChild(keyElement);
      });
    });
  }
  
  // Create waveform bars
  function createWaveformBars() {
    waveformVisualizer.innerHTML = '';
    const barCount = 32;
    
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      waveformVisualizer.appendChild(bar);
    }
  }
  
  // Initialize visualizations
  createPianoKeys();
  createWaveformBars();
  
  // Show status message
  function showStatus(message, className = '') {
    statusText.textContent = message;
    statusDisplay.className = `status-display ${className}`;
  }
  
  // Format time (MM:SS)
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Update progress bar
  function updateProgress(value) {
    progressBar.style.width = `${value * 100}%`;
    progressHandle.style.left = `${value * 100}%`;
  }

  // Initialize Audio Context
  function initAudioContext() {
    try {
      // Fix for Safari and older browsers
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      
      // Create audio processing chain for better sound quality
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.7; // Lower master volume to prevent distortion
      
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.1;
      
      instrumentGain = audioContext.createGain();
      updateInstrumentVolume(); // Set from slider
      
      // Connect the nodes
      instrumentGain.connect(compressor);
      compressor.connect(masterGain);
      masterGain.connect(audioContext.destination);
      
      return true;
    } catch (e) {
      console.error("Failed to create audio context:", e);
      showStatus("Your browser doesn't support Web Audio API", "error");
      return false;
    }
  }
  
  // Update instrument volume from slider
  function updateInstrumentVolume() {
    if (instrumentGain) {
      const volume = instrumentVolumeSlider.value / 100; // Convert to 0-1 range
      instrumentGain.gain.value = volume * 0.5; // Reduce max gain to prevent distortion
    }
  }
  
  // Note frequency lookup
  const noteFrequencies = {
    'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
    'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
    'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
    'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77
  };
  
  // Play a note with improved envelope shaping
  function playNote(noteFreq, duration, startTime = 0, type = 'sine', volume = 0.3) {
    if (!audioContext) return;
    
    // Create oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = noteFreq;
    
    // Improved envelope with longer attack/release to prevent clicks/pops
    const attackTime = 0.03;
    const releaseTime = Math.min(0.1, duration / 4); // Make release proportional to duration
    
    const startTimeAbs = audioContext.currentTime + startTime;
    const endTimeAbs = startTimeAbs + duration;
    
    gainNode.gain.setValueAtTime(0, startTimeAbs);
    gainNode.gain.linearRampToValueAtTime(volume, startTimeAbs + attackTime);
    gainNode.gain.setValueAtTime(volume, endTimeAbs - releaseTime);
    gainNode.gain.linearRampToValueAtTime(0, endTimeAbs);
    
    // Connect audio graph
    oscillator.connect(gainNode);
    gainNode.connect(instrumentGain);
    
    // Play the note
    oscillator.start(startTimeAbs);
    oscillator.stop(endTimeAbs);
    
    activeOscillators.push(oscillator);
    
    // Highlight corresponding key
    const noteMap = {};
    Object.entries(noteFrequencies).forEach(([note, freq]) => {
      noteMap[freq] = note;
    });
    
    const note = noteMap[noteFreq];
    if (note) {
      const keyId = `key-${note.replace('#', 's')}`;
      const keyElement = document.getElementById(keyId);
      if (keyElement) {
        // Schedule key highlight
        const highlightTimeout = setTimeout(() => {
          keyElement.classList.add('active');
          activePianoKeys.push(keyElement);
          
          // Schedule key unhighlight
          const unhighlightTimeout = setTimeout(() => {
            keyElement.classList.remove('active');
          }, duration * 1000);
          
          timeoutIds.push(unhighlightTimeout);
        }, startTime * 1000);
        
        timeoutIds.push(highlightTimeout);
      }
    }
  }
  
  // Play a chord with overlapping harmonics for rich sound
  function playChord(noteFreqs, duration, startTime = 0) {
    // Play root notes at full volume
    noteFreqs.forEach((freq, index) => {
      // Lower notes slightly louder than higher notes
      const volumeMultiplier = 1 - (index * 0.15);
      playNote(freq, duration, startTime, 'sine', 0.3 * volumeMultiplier);
    });
    
    // Add harmonics with triangle wave
    noteFreqs.forEach((freq, index) => {
      const volumeMultiplier = 0.7 - (index * 0.15);
      playNote(freq, duration, startTime, 'triangle', 0.1 * volumeMultiplier);
    });
  }
  
  // Animate waveform
  function animateWaveform() {
    if (!isPlaying) return;
    
    const waveformBars = document.querySelectorAll('.waveform-bar');
    const now = Date.now() / 1000;
    
    waveformBars.forEach((bar, index) => {
      const height = 5 + Math.abs(Math.sin(now * 2 + index * 0.2)) * 40;
      bar.style.height = `${height}px`;
      
      // Color animation
      const hue = (index * 8 + now * 30) % 360;
      bar.style.background = `hsl(${hue}, 80%, 60%)`;
    });
    
    requestAnimationFrame(animateWaveform);
  }
  
  // Richer chord progression
  const chords = [
    {
      name: 'Em7',
      type: 'min7',
      notes: [noteFrequencies.E3, noteFrequencies.G3, noteFrequencies.B3, noteFrequencies.D4]
    },
    {
      name: 'Cmaj9',
      type: 'maj9',
      notes: [noteFrequencies.C3, noteFrequencies.E3, noteFrequencies.G3, noteFrequencies.D4]
    },
    {
      name: 'G/B',
      type: 'maj/3',
      notes: [noteFrequencies.B2, noteFrequencies.G3, noteFrequencies.D4, noteFrequencies.B3]
    },
    {
      name: 'Asus4',
      type: 'sus4',
      notes: [noteFrequencies.A2, noteFrequencies.D3, noteFrequencies.E3, noteFrequencies.A3]
    }
  ];
  
  // Verse 1 - Em7
  const verse1 = [
    { note: noteFrequencies.E4, duration: 0.7, syllable: 0 },
    { note: noteFrequencies.G4, duration: 0.7, syllable: 1 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 2 },
    { note: noteFrequencies.B4, duration: 0.9, syllable: 3 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 4 },
    { note: noteFrequencies.G4, duration: 0.9, syllable: 5 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 6 },
    { note: noteFrequencies.B4, duration: 1.0, syllable: 7 }
  ];
  
  // Verse 2 - Cmaj9
  const verse2 = [
    { note: noteFrequencies.E4, duration: 0.7, syllable: 8 },
    { note: noteFrequencies.G4, duration: 0.7, syllable: 9 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 10 },
    { note: noteFrequencies.G4, duration: 0.7, syllable: 11 },
    { note: noteFrequencies.F4, duration: 0.4, syllable: 12 },
    { note: noteFrequencies.E4, duration: 0.7, syllable: 13 },
    { note: noteFrequencies.D4, duration: 0.7, syllable: 14 },
    { note: noteFrequencies.E4, duration: 1.0, syllable: 15 }
  ];
  
  // Verse 3 - G/B
  const verse3 = [
    { note: noteFrequencies.D4, duration: 0.4, syllable: 16 },
    { note: noteFrequencies.E4, duration: 0.4, syllable: 17 },
    { note: noteFrequencies.G4, duration: 0.9, syllable: 18 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 19 },
    { note: noteFrequencies.B4, duration: 0.4, syllable: 20 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 21 },
    { note: noteFrequencies.G4, duration: 1.0, syllable: 22 }
  ];
  
  // Verse 4 - Asus4
  const verse4 = [
    { note: noteFrequencies.A4, duration: 0.7, syllable: 23 },
    { note: noteFrequencies.B4, duration: 0.4, syllable: 24 },
    { note: noteFrequencies.C5, duration: 0.7, syllable: 25 },
    { note: noteFrequencies.B4, duration: 0.4, syllable: 26 },
    { note: noteFrequencies.A4, duration: 0.4, syllable: 27 },
    { note: noteFrequencies.G4, duration: 0.9, syllable: 28 },
    { note: noteFrequencies.F4, duration: 0.4, syllable: 29 },
    { note: noteFrequencies.E4, duration: 1.0, syllable: 30 }
  ];
  
  // Play the full song with proper chord progression
  function playFullSong() {
    if (!initAudioContext()) {
      return;
    }
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    isPlaying = true;
    showStatus("Performing full song...", "active");
    playBtn.querySelector('.play-btn-container').classList.add('playing');
    
    // Start animation
    animateWaveform();
    
    // Get chord elements for visual highlighting
    const chordElements = document.querySelectorAll('.chord');
    
    // Calculate total duration for progress tracking
    let totalDuration = 0;
    
    // Define sections with their corresponding chord and verse
    const sections = [
      { chord: chords[0], melody: verse1, duration: 5.5 },
      { chord: chords[1], melody: verse2, duration: 5.5 },
      { chord: chords[2], melody: verse3, duration: 4.0 },
      { chord: chords[3], melody: verse4, duration: 5.0 }
    ];
    
    // Calculate total song duration
    const songTotalDuration = sections.reduce((total, section) => total + section.duration, 0);
    
    // Setup progress tracker
    let elapsed = 0;
    progressInterval = setInterval(() => {
      elapsed += 0.1;
      const progress = Math.min(elapsed / songTotalDuration, 1);
      updateProgress(progress);
      document.getElementById('current-time').textContent = formatTime(elapsed);
      
      if (elapsed >= songTotalDuration + 1) {
        stopPlayback();
      }
    }, 100);
    
    // Play each section with its corresponding chord
    let startTime = 0;
    
    sections.forEach((section, sectionIndex) => {
      const { chord, melody, duration } = section;
      
      // Schedule chord change
      const chordTimeout = setTimeout(() => {
        // Clear previous highlights
        chordElements.forEach(el => el.classList.remove('active'));
        
        // Highlight current chord
        chordElements[sectionIndex].classList.add('active');
        
        // Play the chord
        playChord(chord.notes, duration);
        
        console.log(`Playing chord: ${chord.name} at ${startTime} for ${duration} seconds`);
      }, startTime * 1000);
      
      timeoutIds.push(chordTimeout);
      
      // Play melody notes for this section
      melody.forEach((note, noteIndex) => {
        // Calculate when this note should play relative to section start
        const noteTime = startTime + (duration / melody.length) * noteIndex;
        
        // Play the note
        playNote(note.note, note.duration, noteTime);
        
        // Highlight syllable
        const syllableTimeout = setTimeout(() => {
          // Clear previous syllable highlight
          document.querySelectorAll('.syllable').forEach(el => {
            el.classList.remove('active');
          });
          
          // Highlight current syllable
          const syllableElement = document.querySelector(`.syllable[data-syllable="${note.syllable}"]`);
          if (syllableElement) {
            syllableElement.classList.add('active');
          }
        }, noteTime * 1000);
        
        timeoutIds.push(syllableTimeout);
      });
      
      // Move to next section
      startTime += duration;
    });
    
    // Schedule end of song
    const endTimeout = setTimeout(() => {
      stopPlayback();
      showStatus("Performance complete! Bravo!", "active");
    }, (startTime + 1) * 1000);
    
    timeoutIds.push(endTimeout);
  }
  
  // Stop playback
  function stopPlayback() {
    isPlaying = false;
    playBtn.querySelector('.play-btn-container').classList.remove('playing');
    
    // Stop all oscillators
    activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Ignore errors for already stopped oscillators
      }
    });
    activeOscillators = [];
    
    // Clear all timeouts
    timeoutIds.forEach(id => clearTimeout(id));
    timeoutIds = [];
    
    // Clear interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // Remove all highlights
    document.querySelectorAll('.chord').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.syllable').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.piano-key').forEach(el => el.classList.remove('active'));
    
    updateProgress(0);
    document.getElementById('current-time').textContent = '0:00';
    
    showStatus("Ready to perform");
  }
  
  // Event Listeners
  playBtn.addEventListener('click', function() {
    if (isPlaying) {
      stopPlayback();
    } else {
      playFullSong();
    }
  });
  
  stopBtn.addEventListener('click', stopPlayback);
  
  restartBtn.addEventListener('click', function() {
    stopPlayback();
    setTimeout(playFullSong, 100);
  });
  
  // Volume control listener
  instrumentVolumeSlider.addEventListener('input', updateInstrumentVolume);
  
  // Set initial duration display
  document.getElementById('total-time').textContent = formatTime(songDuration);
  
  // Initialize
  showStatus("Ready to perform");
  
  // Enable audio on any user interaction with the page
  document.body.addEventListener('click', function() {
    if (!audioContext) {
      initAudioContext();
    } else if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }, { once: true });
});
