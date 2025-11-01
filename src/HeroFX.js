import * as THREE from 'three';

export class HeroFX {
	constructor(containerEl) {
		this.containerEl = containerEl;
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
		this.camera.position.z = 70;
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.containerEl.appendChild(this.renderer.domElement);

		this.clock = new THREE.Clock();
		this.mouse = new THREE.Vector2();
		this.group = new THREE.Group();
		this.scene.add(this.group);
		
		this.explodeState = null; // null | { phase: 'explode' | 'bounce' | 'return', startTime: number }
		this.explodedVelocities = [];
		this.originalPositions = [];
		this.returnProgress = 0;
		this.spriteBounceCounts = [];
		this.lastVelocitySigns = []; // track velocity signs to detect actual bounces
		this.hammerCanvas = null; // cache hammer cursor canvas
		this.hammerRotation = 0; // current hammer rotation angle
		this.hammerAnimation = null; // null | { startTime: number, startRotation: number }

		// Prepare SVG loader helper
		this._loadSvgTexture = async (url) => {
			try {
				const res = await fetch(url, { mode: 'cors' });
				if (!res.ok) throw new Error('HTTP ' + res.status);
				const svgText = await res.text();
				const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
				return await new Promise((resolve) => {
					const img = new Image();
					img.crossOrigin = 'anonymous';
					img.onload = () => {
						const tex = new THREE.Texture(img);
						tex.needsUpdate = true;
						resolve(tex);
					};
					img.src = dataUrl;
				});
			} catch (e) {
				return null;
			}
		};

		this._initLogos();
		this._onResize();
		window.addEventListener('resize', this._onResize);
		window.addEventListener('mousemove', this._onMouseMove);
		this.renderer.domElement.addEventListener('click', this._onClick);
		this.renderer.domElement.style.pointerEvents = 'auto';
		this._animate();
	}

	dispose = () => {
		cancelAnimationFrame(this._raf);
		window.removeEventListener('resize', this._onResize);
		window.removeEventListener('mousemove', this._onMouseMove);
		this.renderer.domElement.removeEventListener('click', this._onClick);
		this.renderer.dispose();
		if (this.containerEl && this.renderer.domElement.parentNode === this.containerEl) {
			this.containerEl.removeChild(this.renderer.domElement);
		}
	};

	_initParticles() {
		const particleCount = 800;
		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(particleCount * 3);
		const colors = new Float32Array(particleCount * 3);

		const color = new THREE.Color();
		for (let i = 0; i < particleCount; i++) {
			positions[i * 3 + 0] = (Math.random() - 0.5) * 200;
			positions[i * 3 + 1] = (Math.random() - 0.5) * 120;
			positions[i * 3 + 2] = (Math.random() - 0.5) * 200;

			// teal to cyan gradient
			color.setHSL(0.48 + Math.random() * 0.06, 0.7, 0.55);
			colors[i * 3 + 0] = color.r;
			colors[i * 3 + 1] = color.g;
			colors[i * 3 + 2] = color.b;
		}

		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			size: 1.8,
			sizeAttenuation: true,
			vertexColors: true,
			transparent: true,
			opacity: 0.85,
		});

		this.points = new THREE.Points(geometry, material);
		this.scene.add(this.points);
	}

	_onResize = () => {
		const { clientWidth, clientHeight } = this.containerEl;
		this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(clientWidth, clientHeight, false);

		// compute bounds for horizontal scaling
		const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.camera.position.z;
		const halfW = halfH * this.camera.aspect;
		const safety = 4;
		const spriteHalf = 3.25;
		let maxPlannedRadius = 1;
		for (const s of this.toolSprites || []) maxPlannedRadius = Math.max(maxPlannedRadius, (s.userData && s.userData.radius) || 0);
		const maxAllowedX = Math.max(1, halfW - safety - spriteHalf);
		this.xScale = Math.min(1.5, maxAllowedX / Math.max(1, maxPlannedRadius));
	};

	_getHammerCursor = (rotation = 0) => {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const ctx = canvas.getContext('2d');
		
		// Draw hammer emoji with rotation
		ctx.save();
		ctx.translate(64, 64);
		ctx.rotate(rotation);
		ctx.font = '96px Arial';
		ctx.fillText('🔨', -48, 32);
		ctx.restore();
		
		return canvas.toDataURL();
	};

	_onMouseMove = (e) => {
		const rect = this.containerEl.getBoundingClientRect();
		this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		
		// Check if hovering over any sprite
		if (!this.explodeState && this.toolSprites) {
			const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
			const clickWorldPos = new THREE.Vector3(x * 50, y * 40, 0);
			
			let hovering = false;
			const hoverThreshold = 15;
			
			for (const sprite of this.toolSprites) {
				const distance = sprite.position.distanceTo(clickWorldPos);
				if (distance < hoverThreshold) {
					hovering = true;
					break;
				}
			}
			
			// Change cursor to hammer emoji when hovering
			if (hovering) {
				const dataUrl = this._getHammerCursor(this.hammerRotation);
				this.renderer.domElement.style.cursor = `url(${dataUrl}) 64 64, pointer`;
			} else {
				this.renderer.domElement.style.cursor = 'default';
			}
		} else if (!this.explodeState) {
			this.renderer.domElement.style.cursor = 'default';
		}
	};

	_onClick = (e) => {
		if (this.explodeState) return; // already exploding
		if (!this.toolSprites || this.toolSprites.length === 0) return;
		
		// Get click position in normalized screen coordinates
		const rect = this.containerEl.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		
		// Convert to 3D world position
		const clickWorldPos = new THREE.Vector3(x * 50, y * 40, 0);
		
		// Check if click is near any sprite
		let clickedSprite = false;
		const clickThreshold = 15; // distance threshold
		
		for (const sprite of this.toolSprites) {
			const distance = sprite.position.distanceTo(clickWorldPos);
			if (distance < clickThreshold) {
				clickedSprite = true;
				break;
			}
		}
		
		if (!clickedSprite) return; // clicked empty space
		
		// Start hammer rotation animation
		this.hammerAnimation = { startTime: this.clock.getElapsedTime(), startRotation: this.hammerRotation };
		
		// Start explosion
		this.explodeState = { phase: 'explode', startTime: this.clock.getElapsedTime() };
		this.explodedVelocities = [];
		this.originalPositions = [];
		this.returnProgress = 0;
		this.spriteBounceCounts = [];
		this.lastVelocitySigns = [];
		
		// Store original positions and create velocities
		this.toolSprites.forEach((sprite, i) => {
			const pos = sprite.position.clone();
			this.originalPositions[i] = pos;
			
			// Velocity away from click point - INSANELY fast to ensure 5+ bounces
			const dir = pos.clone().sub(clickWorldPos).normalize();
			const speed = 150 + Math.random() * 100; // EXTREMELY fast: 150-250
			this.explodedVelocities[i] = dir.multiplyScalar(speed);
			this.spriteBounceCounts[i] = 0; // initialize bounce counter
			this.lastVelocitySigns[i] = { x: 0, y: 0, z: 0 }; // initialize velocity sign tracking
		});
	};

	_animate = () => {
		this._raf = requestAnimationFrame(this._animate);
		const t = this.clock.getElapsedTime();
		
		// Handle hammer rotation animation
		if (this.hammerAnimation) {
			const elapsed = t - this.hammerAnimation.startTime;
			const duration = 0.4; // 400ms rotation animation for smoother feel
			
			if (elapsed < duration) {
				// Rotate hammer down and bounce back
				const progress = elapsed / duration;
				
				if (progress < 0.5) {
					// Swing down to -45 degrees with ease-in
					const swingProgress = progress * 2;
					const easeIn = swingProgress * swingProgress;
					this.hammerRotation = this.hammerAnimation.startRotation - (Math.PI / 4) * easeIn;
				} else {
					// Bounce back to 0 with ease-out
					const bounceProgress = (progress - 0.5) * 2;
					const easeOut = 1 - Math.pow(1 - bounceProgress, 3);
					this.hammerRotation = -(Math.PI / 4) + (Math.PI / 4) * easeOut;
				}
				
				// Update cursor
				const dataUrl = this._getHammerCursor(this.hammerRotation);
				this.renderer.domElement.style.cursor = `url(${dataUrl}) 64 64, pointer`;
			} else {
				// Animation complete
				this.hammerRotation = 0;
				this.hammerAnimation = null;
			}
		}
		
		// Handle explode animation
		if (this.explodeState) {
			const elapsed = t - this.explodeState.startTime;
			const dt = 0.016; // ~60fps
			
			if (this.explodeState.phase === 'explode') {
				// Explode phase: scatter outward
				for (let i = 0; i < this.toolSprites.length; i++) {
					const s = this.toolSprites[i];
					s.position.add(this.explodedVelocities[i].clone().multiplyScalar(dt));
					
					if (s.userData && s.userData.label) {
						const lbl = s.userData.label;
						lbl.position.set(s.position.x, s.position.y - (lbl.userData.yGap || 3.8), s.position.z);
					}
				}
				
				// Switch to bounce after 0.2s (much faster)
				if (elapsed > 0.2) {
					this.explodeState.phase = 'bounce';
					this.explodeState.startTime = t;
				}
			} else if (this.explodeState.phase === 'bounce') {
				// Bounce phase: apply physics with boundary checks
				const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.camera.position.z;
				const halfW = halfH * this.camera.aspect;
				const damping = 0.99; // minimal damping for maximum bouncing
				
				for (let i = 0; i < this.toolSprites.length; i++) {
					const s = this.toolSprites[i];
					const lastSign = this.lastVelocitySigns[i];
					
					// Update position
					s.position.add(this.explodedVelocities[i].clone().multiplyScalar(dt));
					
					// Bounce off LEFT and RIGHT sides
					if (Math.abs(s.position.x) > halfW - 3) {
						// Count bounce if velocity changed direction
						if (lastSign.x !== 0 && Math.sign(this.explodedVelocities[i].x) !== lastSign.x) {
							this.spriteBounceCounts[i]++;
						}
						this.explodedVelocities[i].x *= -damping;
						s.position.x = Math.sign(s.position.x) * (halfW - 3);
					}
					
					// Bounce off TOP and BOTTOM sides
					if (Math.abs(s.position.y) > halfH - 3) {
						// Count bounce if velocity changed direction
						if (lastSign.y !== 0 && Math.sign(this.explodedVelocities[i].y) !== lastSign.y) {
							this.spriteBounceCounts[i]++;
						}
						this.explodedVelocities[i].y *= -damping;
						s.position.y = Math.sign(s.position.y) * (halfH - 3);
					}
					
					// Bounce off Z boundaries
					if (Math.abs(s.position.z) > 50) {
						// Count bounce if velocity changed direction
						if (lastSign.z !== 0 && Math.sign(this.explodedVelocities[i].z) !== lastSign.z) {
							this.spriteBounceCounts[i]++;
						}
						this.explodedVelocities[i].z *= -damping;
						s.position.z = Math.sign(s.position.z) * 50;
					}
					
					// Apply damping
					this.explodedVelocities[i].multiplyScalar(damping);
					
					// Update velocity signs after all bounce logic
					this.lastVelocitySigns[i] = {
						x: Math.sign(this.explodedVelocities[i].x),
						y: Math.sign(this.explodedVelocities[i].y),
						z: Math.sign(this.explodedVelocities[i].z)
					};
					
					if (s.userData && s.userData.label) {
						const lbl = s.userData.label;
						lbl.position.set(s.position.x, s.position.y - (lbl.userData.yGap || 3.8), s.position.z);
					}
				}
				
				// Check if velocities are low enough to start return
				const avgSpeed = this.explodedVelocities.reduce((sum, vel) => sum + vel.length(), 0) / this.explodedVelocities.length;
				if (avgSpeed < 1.0) {
					this.explodeState.phase = 'return';
					this.explodeState.startTime = t;
				}
			} else if (this.explodeState.phase === 'return') {
				// Return phase: smoothly return to original rotation paths
				const returnDuration = 2.0;
				const progress = Math.min(1, (t - this.explodeState.startTime) / returnDuration);
				
				const easeOut = 1 - Math.pow(1 - progress, 3); // cubic ease-out
				
				for (let i = 0; i < this.toolSprites.length; i++) {
					const s = this.toolSprites[i];
					const orig = this.originalPositions[i];
					
					// Lerp towards original position
					s.position.lerp(orig, easeOut);
					
					if (s.userData && s.userData.label) {
						const lbl = s.userData.label;
						lbl.position.set(s.position.x, s.position.y - (lbl.userData.yGap || 3.8), s.position.z);
					}
				}
				
				// End animation and resume normal rotation
				if (progress >= 1) {
					// Recalculate angle offsets for seamless continuation from current positions
					const currentTime = this.clock.getElapsedTime();
					for (let i = 0; i < this.toolSprites.length; i++) {
						const s = this.toolSprites[i];
						const radius = s.userData.radius || 45;
						const circleScale = Math.min(this.xScale || 1, 0.70);
						
						// Calculate current angle based on x, y position
						const scaledX = s.position.x / circleScale;
						const scaledY = (s.position.y - s.userData.yOffset) / circleScale;
						const currentAngle = Math.atan2(scaledY, scaledX);
						
						// Adjust angle offset so sprite continues from current position
						s.userData.angleOffset = currentAngle - (currentTime * s.userData.speed);
					}
					
					this.explodeState = null;
				}
			}
		} else {
			// Normal rotation
			this.group.rotation.y = this.mouse.x * 0.12;
			this.group.rotation.x = this.mouse.y * 0.08;

			if (this.toolSprites) {
				for (let i = 0; i < this.toolSprites.length; i++) {
					const s = this.toolSprites[i];
					const a = t * s.userData.speed + s.userData.angleOffset;
					// Proper circular path (same radius on both axes), clamped to viewport
					const circleScale = Math.min(this.xScale || 1, 0.70);
					s.position.y = Math.sin(a) * (s.userData.radius * circleScale) + (s.userData.yOffset || 0);
					s.position.x = Math.cos(a) * (s.userData.radius * circleScale);
					s.position.z = Math.sin(a) * 2;
					if (s.userData && s.userData.label) {
						const lbl = s.userData.label;
						lbl.position.set(s.position.x, s.position.y - (lbl.userData.yGap || 3.8), s.position.z);
					}
				}
			}
		}
		
		this.renderer.render(this.scene, this.camera);
	};

	_initLogos() {
		const base = 'https://cdn.simpleicons.org/';

		const mapSpecial = (label) => {
			const l = (label || '').toLowerCase();
			const m = {
				'c++': 'cplusplus',
				'node.js': 'nodedotjs',
				'next.js': 'nextdotjs',
				'microsoft sql server': 'microsoftsqlserver',
				'power bi': 'powerbi',
				'azure': 'microsoftazure',
			};
			if (m[l]) return m[l];
			return l.replace(/\s+/g, '').replace(/[.+]/g, '');
		};

		const entries = [];
		const skillEls = document.querySelectorAll('#skills .skill');
		skillEls.forEach((el) => {
			const img = el.querySelector('img[alt]');
			if (img) {
				const label = img.getAttribute('alt') || '';
				entries.push({ slug: mapSpecial(label), label });
				return;
			}
			const fa = el.querySelector('.icon');
			if (fa) {
				const cls = Array.from(fa.classList).find((c) => c.startsWith('fa-')) || '';
				const label = (el.querySelector('span')?.textContent || '').trim();
				const slug = mapSpecial(label || cls.replace('fa-', ''));
				entries.push({ slug, label: label || slug });
			}
		});

		// fallback if nothing found
		if (entries.length === 0) {
			entries.push(
				{ slug: 'react', label: 'React' },
				{ slug: 'nextdotjs', label: 'Next.js' },
				{ slug: 'typescript', label: 'TypeScript' }
			);
		}

		// de-duplicate by slug
		const seen = new Set();
		const tools = entries.filter((e) => {
			if (!e.slug) return false;
			if (seen.has(e.slug)) return false;
			seen.add(e.slug); return true;
		});

		this.toolSprites = [];
		const baseRadius = 45;
		const ringOffset = 14;

		const build = async (i) => {
			const url = base + tools[i].slug;
			const texture = await this._loadSvgTexture(url);
			if (!texture) return; // skip items without a supported icon
			const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
			const sprite = new THREE.Sprite(mat);
			sprite.scale.set(8, 8, 1);
			const ring = i % 2;
			const radius = baseRadius + (ring ? ringOffset : 6);
			const angleOffset = (Math.PI * 2 * i) / tools.length;
			const yOffset = (i % 3 - 1) * 2.0 + (ring ? 0.8 : -0.8);
			const speed = 0.25 + (ring ? 0.12 : 0);
			sprite.userData = { angleOffset, yOffset, radius, speed };
			this.toolSprites.push(sprite);
			this.group.add(sprite);

			const labelTex = this._makeLabelTexture(tools[i].label);
			const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false });
			const label = new THREE.Sprite(labelMat);
			label.center.set(0.5, 1.0);
			const labelH = 2.2;
			const aspect = labelTex.image.width / Math.max(1, labelTex.image.height);
			label.scale.set(labelH * aspect, labelH, 1);
			label.userData = { parent: sprite, yGap: 3.8 };
			sprite.userData.label = label;
			this.group.add(label);

			this._onResize();
		};

		for (let i = 0; i < tools.length; i++) build(i);
	}

	_makeLabelTexture(text) {
		const padding = 16;
		const fontSize = 64;
		const font = `${fontSize}px Inter, Arial, Helvetica, sans-serif`;
		const tmp = document.createElement('canvas');
		const ctx = tmp.getContext('2d');
		ctx.font = font;
		const metrics = ctx.measureText(text);
		const w = Math.ceil(metrics.width + padding * 2);
		const h = Math.ceil(fontSize + padding * 2);
		const pot = (n) => Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
		tmp.width = pot(w);
		tmp.height = pot(h);
		const cx = tmp.getContext('2d');
		cx.clearRect(0, 0, tmp.width, tmp.height);
		cx.font = font;
		cx.textAlign = 'center';
		cx.textBaseline = 'middle';
		cx.shadowColor = 'rgba(0,0,0,0.65)';
		cx.shadowBlur = 8;
		cx.fillStyle = '#ffffff';
		cx.fillText(text, tmp.width / 2, tmp.height / 2);
		const tex = new THREE.CanvasTexture(tmp);
		tex.needsUpdate = true;
		return tex;
	}
}



