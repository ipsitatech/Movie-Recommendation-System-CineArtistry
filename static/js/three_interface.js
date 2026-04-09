// Three.js 3D Movie Carousel — Lazy Initialization
// Only initializes when the container is first made visible to avoid 0x0 renderer size.

let threeInitialized = false;

function initThreeScene() {
    const container = document.getElementById('three-canvas-container');
    if (!container || threeInitialized) return;
    threeInitialized = true;

    let scene, camera, renderer, carousel;
    const radius = 15;
    const cards = [];

    // ── Scene ──────────────────────────────────────────────────────────────
    scene = new THREE.Scene();

    // ── Camera ─────────────────────────────────────────────────────────────
    camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.z = 25;
    camera.position.y = 2;

    // ── Renderer ───────────────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // ── Lighting ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const pointLight = new THREE.PointLight(0x00d4ff, 1);
    pointLight.position.set(20, 10, 20);
    scene.add(pointLight);

    const pinkLight = new THREE.PointLight(0xff006e, 0.8);
    pinkLight.position.set(-20, -10, 20);
    scene.add(pinkLight);

    // ── Carousel Group ──────────────────────────────────────────────────────
    carousel = new THREE.Group();
    scene.add(carousel);

    // ── Load Movies ────────────────────────────────────────────────────────
    async function loadMovies3D() {
        try {
            const response = await fetch('/api/movies');
            const data = await response.json();
            const movies = data.slice(0, 12);
            createCarousel(movies);
        } catch (error) {
            console.error('Error fetching movies for 3D interface:', error);
        }
    }

    function createCarousel(movies) {
        const textureLoader = new THREE.TextureLoader();
        const angleStep = (Math.PI * 2) / movies.length;

        movies.forEach((movie, i) => {
            // Fallback placeholder color if image fails
            const geometry = new THREE.PlaneGeometry(6, 9);

            // Create canvas-based fallback texture
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 384;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 256, 384);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(1, '#16213e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 384);
            ctx.fillStyle = '#f5c518';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Word wrap title
            const words = movie.title.split(' ');
            let line = '';
            let y = 192;
            words.forEach(word => {
                const testLine = line + word + ' ';
                if (ctx.measureText(testLine).width > 220 && line !== '') {
                    ctx.fillText(line, 128, y - 15);
                    line = word + ' ';
                    y += 30;
                } else {
                    line = testLine;
                }
            });
            ctx.fillText(line, 128, y);

            const fallbackTexture = new THREE.CanvasTexture(canvas);
            const material = new THREE.MeshStandardMaterial({
                map: fallbackTexture,
                side: THREE.DoubleSide,
                transparent: true,
                metalness: 0.3,
                roughness: 0.4
            });

            const card = new THREE.Mesh(geometry, material);
            const angle = i * angleStep;
            card.position.x = radius * Math.cos(angle);
            card.position.z = radius * Math.sin(angle);
            card.lookAt(0, 0, 0);
            card.userData = { movie };

            carousel.add(card);
            cards.push(card);

            // Try to load real poster image on top
            if (movie.image_url) {
                const loader = new THREE.TextureLoader();
                loader.load(
                    movie.image_url,
                    (texture) => { material.map = texture; material.needsUpdate = true; },
                    undefined,
                    () => {} // silently use fallback on error
                );
            }
        });
    }

    // ── Resize Handler ─────────────────────────────────────────────────────
    function onWindowResize() {
        if (!container.clientWidth) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener('resize', onWindowResize);

    // ── Mouse Wheel Rotation ───────────────────────────────────────────────
    container.addEventListener('wheel', (event) => {
        event.preventDefault();
        carousel.rotation.y += event.deltaY * 0.003;
    }, { passive: false });

    // ── Click to Open Modal ────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('click', (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(cards);

        if (intersects.length > 0) {
            const movie = intersects[0].object.userData.movie;
            if (typeof window.openMovieModal === 'function') {
                window.openMovieModal(movie);
            }
        }
    });

    // ── Animation Loop ─────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);
        if (carousel) carousel.rotation.y += 0.003;
        renderer.render(scene, camera);
    }

    loadMovies3D();
    animate();
}

// Export for main.js to call
window.initThreeScene = initThreeScene;
