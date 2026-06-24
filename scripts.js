document.addEventListener('DOMContentLoaded', () => {
    const playButton = document.getElementById('play-button');
    const nextButton = document.getElementById('next-button');
    const shuffleButton = document.getElementById('shuffle-button');
    const body = document.body;
    const trackTitle = document.querySelector('h2');
    let player;
    let isPlaying = false;
    let isInitialized = false;

    const noSleep = new NoSleep(); // Initialize NoSleep

    const tracks = [
        { title: "one", url: "1.mp3", className: "track-one" },
        { 
            title: "two", 
            url: () => Math.random() < 0.4 ? "2b.mp3" : "2.mp3", // 40% chance to play 2b.mp3
            className: "track-two" 
        },
        { title: "three", url: "3.mp3", className: "track-three" },
        { title: "four", url: "4.mp3", className: "track-four" }
    ];
    let currentTrackIndex = 0;

    async function initializeAudio(url, autoplay = false) {
        console.log("Initializing audio for URL:", url);
        if (isInitialized) return;

        try {
            await Tone.start();
            player = new Tone.Player({
                url: url,
                loop: true, // Ensure the audio loops
                autostart: autoplay, // Start playing if autoplay is true
                onload: () => {
                    console.log("Audio loaded successfully");
                    playButton.disabled = false;
                    if (autoplay) {
                        playButton.innerHTML = '<i class="fa-solid fa-pause"></i>'; // Show pause icon if autoplaying
                        isPlaying = true; // Update isPlaying status if autoplay is true
                        noSleep.enable(); // Enable NoSleep when autoplaying
                    } else {
                        playButton.innerHTML = '<i class="fa-solid fa-play"></i>'; // Show play icon if not autoplaying
                    }
                    isInitialized = true;
                },
                onerror: (error) => {
                    console.error("Error initializing audio:", error);
                    playButton.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i>';
                    alert('Error initializing audio. Please try again.');
                }
            }).toDestination();
        } catch (error) {
            console.error("Error initializing audio:", error);
            playButton.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i>';
            alert('Error initializing audio. Please try again.');
        }
    }

    function togglePlayback() {
        if (!isInitialized) return;

        if (isPlaying) {
            player.stop();
            playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
            noSleep.disable(); // Disable NoSleep when paused
        } else {
            player.start();
            playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
            noSleep.enable(); // Enable NoSleep when playing
        }
        isPlaying = !isPlaying;
    }

    function loadTrack(index, autoplay = false) {
        if (player) {
            player.stop();
            player.dispose();
        }
        isInitialized = false;
        const track = tracks[index];
        console.log("Loading track:", track.title);
        body.className = track.className;
        trackTitle.textContent = track.title;
        const url = typeof track.url === 'function' ? track.url() : track.url; // Resolve track URL
        initializeAudio(url, autoplay); // Initialize audio with resolved URL
    }

    function shuffleTrack() {
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * tracks.length);
        } while (randomIndex === currentTrackIndex);
        currentTrackIndex = randomIndex;
        loadTrack(currentTrackIndex, isPlaying); // Use isPlaying to determine autoplay
    }

    playButton.addEventListener('click', async () => {
        if (!isInitialized) {
            const currentTrack = tracks[currentTrackIndex];
            const url = typeof currentTrack.url === 'function' ? currentTrack.url() : currentTrack.url;
            await initializeAudio(url, true);
        } else {
            togglePlayback();
        }
    });

    nextButton.addEventListener('click', () => {
        currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
        loadTrack(currentTrackIndex, isPlaying); // Use isPlaying to determine autoplay
    });

    shuffleButton.addEventListener('click', () => {
        shuffleTrack();
    });

    // Initialize the first track but do not preload audio
    console.log("Initializing the first track without preloading audio");
    const initialTrack = tracks[currentTrackIndex];
    body.className = initialTrack.className;
    trackTitle.textContent = initialTrack.title;
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>'; // Show play icon initially
});