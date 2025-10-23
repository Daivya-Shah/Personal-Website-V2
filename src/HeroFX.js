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
		this._animate();
	}

	dispose = () => {
		cancelAnimationFrame(this._raf);
		window.removeEventListener('resize', this._onResize);
		window.removeEventListener('mousemove', this._onMouseMove);
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

	_onMouseMove = (e) => {
		const rect = this.containerEl.getBoundingClientRect();
		this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
	};

	_animate = () => {
		this._raf = requestAnimationFrame(this._animate);
		const t = this.clock.getElapsedTime();
		// Subtle mouse tilt only
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



