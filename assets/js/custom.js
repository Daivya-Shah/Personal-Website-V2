// Skills icon fallback
(function(){
	function fallbackBadge(imgEl){
		var li = imgEl.closest('.skill');
		imgEl.remove();
		if (li && !li.querySelector('img, .icon')) li.classList.add('text-only');
	}

	document.querySelectorAll('#skills .skill img').forEach(function(img){
		img.addEventListener('error', function(){ fallbackBadge(img); });
		if (img.complete && img.naturalWidth === 0) fallbackBadge(img);
	});

	document.querySelectorAll('#skills .skill').forEach(function(li){
		if (!li.querySelector('img, .icon')) li.classList.add('text-only');
	});
})();

// Experience details toggle (vanilla, delegated)
(function(){
	document.addEventListener('click', function(e){
		var btn = e.target.closest('#experience .spotlight .actions a.button.details');
		if (!btn) return;
		e.preventDefault();

		var targetId = btn.getAttribute('aria-controls');
		var details = document.getElementById(targetId);
		if (!details) return;

		var isOpen = btn.getAttribute('aria-expanded') === 'true';

		// Close others
		document.querySelectorAll('#experience .spotlight .actions a.button.details[aria-expanded="true"]').forEach(function(other){
			if (other !== btn) {
				other.setAttribute('aria-expanded','false');
				var l = other.querySelector('.label'); if (l) l.textContent = 'View Details';
			}
		});
		document.querySelectorAll('#experience .spotlight-details').forEach(function(el){
			if (el !== details) { el.classList.remove('open'); el.style.maxHeight = '0px'; el.setAttribute('aria-hidden','true'); }
		});

		if (isOpen) {
			btn.setAttribute('aria-expanded','false');
			var l1 = btn.querySelector('.label'); if (l1) l1.textContent = 'View Details';
			details.classList.remove('open');
			details.style.maxHeight = '0px';
			details.setAttribute('aria-hidden','true');
		} else {
			btn.setAttribute('aria-expanded','true');
			var l2 = btn.querySelector('.label'); if (l2) l2.textContent = 'Hide Details';
			details.classList.add('open');
			requestAnimationFrame(function(){
				details.style.maxHeight = details.scrollHeight + 'px';
			});
			details.setAttribute('aria-hidden','false');
		}
	});

	// Menu toggle fallback (if HTML5 UP panel plugin absent)
	if (!(window.jQuery && jQuery.fn && jQuery.fn.panel)) {
		document.addEventListener('click', function(e){
			var open = e.target.closest('a[href="#menu"]');
			if (open) { e.preventDefault(); document.body.classList.toggle('is-menu-visible'); }
			var close = e.target.closest('#menu .close');
			if (close) { e.preventDefault(); document.body.classList.remove('is-menu-visible'); }
		});

		var menu = document.getElementById('menu');
		if (menu) {
			menu.addEventListener('click', function(e){
				var a = e.target.closest('a[href^="#"]');
				if (!a) return;
				var href = a.getAttribute('href');
				if (!href || href === '#') return;
				var target = document.querySelector(href);
				if (target) {
					e.preventDefault();
					document.body.classList.remove('is-menu-visible');
					target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			});
		}
	}

	// Hide menu on ESC
	document.addEventListener('keydown', function(e){
		if (e.key === 'Escape') document.body.classList.remove('is-menu-visible');
	});
})();


