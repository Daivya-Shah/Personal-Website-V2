import { useEffect } from 'react';
import { HeroFX } from './HeroFX.js';

export default function App() {
	// Mount existing HTML5UP JS behaviors if present
	useEffect(() => {
		// Initialize Three.js hero FX
		const container = document.querySelector('#banner .fx-layer');
		let fxInstance;
		if (container) {
			fxInstance = new HeroFX(container);
		}
		return () => {
			if (fxInstance) fxInstance.dispose();
		};
	}, []);

	return null;
}



