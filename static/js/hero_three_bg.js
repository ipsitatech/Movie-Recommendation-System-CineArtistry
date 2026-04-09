// hero_three_bg.js - Smooth 3D Interactive Background with Floating Posters
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('hero-three-bg');
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060d17); 
    // Smooth, deep fog to elegantly hide pop-ins
    scene.fog = new THREE.FogExp2(0x060d17, 0.035);

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 150);
    camera.position.z = 15;
    camera.position.y = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio for smoother performance
    container.appendChild(renderer.domElement);

    // ── 3D Grid Terrain (Simplified) ──
    const geometry = new THREE.PlaneGeometry(150, 120, 20, 20); // Further reduced segments
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const y = vertices[i+1];
        vertices[i+2] = Math.sin(x/6) * Math.cos(y/6) * 1.5 + Math.sin(x/2) * 0.5;
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: 0x060d17,
        roughness: 0.8,
        metalness: 0.2,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.1
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -3.5;
    scene.add(plane);

    // ── Floating Cinematic Particles ──
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 200; // Drastically reduced for performance
    const posArr = new Float32Array(particleCount * 3);
    for(let i=0; i < particleCount * 3; i++) {
        posArr[i]   = (Math.random() - 0.5) * 100;
        posArr[i+1] = (Math.random() - 0.5) * 50;
        posArr[i+2] = (Math.random() - 0.5) * 60;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const particleMat = new THREE.PointsMaterial({
        size: 0.08,
        color: 0xf5c518,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ── Floating Movie Posters ──
    const postersData = [];
    const posterGroup = new THREE.Group();
    scene.add(posterGroup);

    async function loadFloatingPosters() {
        try {
            // Optimization: Only fetch a small number of movies for the background
            const res = await fetch('/api/movies?limit=20');
            const movies = await res.json();
            
            // Filter valid poster images and shuffle
            const valid = movies.filter(m => m.image_url && m.image_url.startsWith('http'))
                                .sort(() => 0.5 - Math.random());
                                
            const selected = valid.slice(0, 6); // Drastically reduced from 12 for maximum stability
            
            const textureLoader = new THREE.TextureLoader();
            selected.forEach(movie => {
                textureLoader.load(movie.image_url, (texture) => {
                    const posterGeo = new THREE.PlaneGeometry(5, 7.5);
                    const baseOpacity = 0.95;
                    
                    const posterMat = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0 
                    });
                    
                    const mesh = new THREE.Mesh(posterGeo, posterMat);
                    
                    mesh.position.set(
                        (Math.random() - 0.5) * 70,
                        (Math.random() * 5) - 3.5,
                        (Math.random() - 0.5) * 60 - 15
                    );
                    
                    mesh.rotation.y = (Math.random() - 0.5) * 0.5;
                    mesh.rotation.x = (Math.random() - 0.5) * 0.1;

                    posterGroup.add(mesh);
                    
                    postersData.push({
                        mesh: mesh,
                        startZ: mesh.position.z,
                        speedZ: Math.random() * 0.03 + 0.02,
                        floatSpeedY: Math.random() * 0.01 + 0.005,
                        yOffset: Math.random() * Math.PI * 2,
                        baseY: mesh.position.y,
                        rotSpeedY: (Math.random() - 0.5) * 0.005,
                        rotSpeedX: (Math.random() - 0.5) * 0.003,
                        targetOpacity: baseOpacity
                    });
                });
            });
            
        } catch(e) {
            console.error('Three.js poster load error:', e);
        }
    }
    loadFloatingPosters();

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    const blueLight = new THREE.PointLight(0x00d4ff, 1.2, 80);
    blueLight.position.set(-20, -10, -10);
    scene.add(blueLight);

    const goldLight = new THREE.PointLight(0xf5c518, 1.0, 80);
    goldLight.position.set(20, 15, 5);
    scene.add(goldLight);

    // ── Mouse Interaction (Damped) ──
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    
    document.addEventListener('mousemove', (e) => {
        // Only track mouse in the top bounds to constrain tracking
        if(e.clientY > container.clientHeight) return;
        targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
        targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // ── Performance Optimization: Intersection Observer ──
    let isVisible = true;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isVisible = entry.isIntersecting;
        });
    }, { threshold: 0.1 });
    observer.observe(container);

    // ── Smooth Animation Loop ──
    let time = 0;
    const animate = () => {
        requestAnimationFrame(animate);
        if (!isVisible) return; // Optimization: Stop rendering when not in view

        time += 0.002; // Slower global time for elegance

        // Glide the grid smoothly
        plane.position.z = (time * 10) % 2.0;

        // Ultra-smooth Camera Parallax (double lerp)
        currentMouseX += (targetMouseX - currentMouseX) * 0.02;
        currentMouseY += (targetMouseY - currentMouseY) * 0.02;
        
        camera.position.x += (currentMouseX * 3 - camera.position.x) * 0.05;
        camera.position.y += (currentMouseY * 1.5 + 5 - camera.position.y) * 0.05;
        camera.lookAt(0, 0, 0);

        // Elegant particle rotation
        particles.rotation.y = time * 0.3;
        particles.rotation.x = time * 0.1;

        // Smooth Posters Logic
        postersData.forEach(p => {
            // Drift towards camera
            p.mesh.position.z += p.speedZ;
            
            // Soft floating up and down
            p.mesh.position.y = p.baseY + Math.sin(time * 300 * p.floatSpeedY + p.yOffset) * 1.0;
            
            // Gentle continuous rotation
            p.mesh.rotation.y += p.rotSpeedY;
            p.mesh.rotation.x += p.rotSpeedX;

            // Distance-based Smooth Fade In / Fade Out
            const distZ = camera.position.z - p.mesh.position.z;
            
            if (distZ < 5) {
                // Fade out smoothly right before passing camera
                p.mesh.material.opacity = p.targetOpacity * Math.max(0, distZ / 5);
            } else if (distZ > 50) {
                // Fade in smoothly when emerging from deep fog
                p.mesh.material.opacity = p.targetOpacity * Math.max(0, (70 - distZ) / 20);
            } else {
                p.mesh.material.opacity = p.targetOpacity;
            }

            // Loop back into deep fog when passing camera
            if (p.mesh.position.z > camera.position.z + 4) {
                p.mesh.position.z = camera.position.z - 60 - Math.random() * 20; // reset far back
                p.mesh.position.x = (Math.random() - 0.5) * 70; // new wider X
                p.mesh.position.y = (Math.random() * 5) - 3.5;  // strictly lower Y
                p.baseY = p.mesh.position.y;
                p.mesh.material.opacity = 0; // Reset opacity
            }
        });

        renderer.render(scene, camera);
    };
    animate();

    // ── Resize Handler ──
    window.addEventListener('resize', () => {
        if (!container.clientWidth) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
});
