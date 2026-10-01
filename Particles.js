// ============================================================
// PARTICULES : panneau gauche des pages connexion / création
// Le canvas est injecté ici : aucune modification du HTML nécessaire.
// ============================================================
(function () {
  const COLOR = "31, 58, 95";   // = --accent (#1F3A5F), bleu du bouton
  const LINK_DIST = 130;        // distance max pour relier deux particules
  const MOUSE_RADIUS = 150;     // zone d'influence de la souris
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initParticles(aside) {
    const canvas = document.createElement("canvas");
    canvas.className = "auth-particles";
    canvas.setAttribute("aria-hidden", "true");
    aside.prepend(canvas);

    const ctx = canvas.getContext("2d");
    const mouse = { x: null, y: null };
    let w = 0, h = 0, particles = [];

    function createParticle() {
      const speed = reduceMotion ? 0 : 0.4;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r: Math.random() < 0.12 ? 3 + Math.random() * 1.5 : 1.2 + Math.random() * 1.6,
        ox: 0, oy: 0            // décalage causé par la souris
      };
    }

    function resize() {
      w = aside.clientWidth;
      h = aside.clientHeight;
      if (!w || !h) return;     // vue masquée
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.min(90, Math.round((w * h) / 9000));
      while (particles.length < target) particles.push(createParticle());
      particles.length = target;
      particles.forEach(p => { p.x = Math.min(p.x, w); p.y = Math.min(p.y, h); });
    }

    function frame() {
      requestAnimationFrame(frame);
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        // Répulsion douce autour du curseur, puis retour progressif
        if (mouse.x !== null && !reduceMotion) {
          const dx = p.x + p.ox - mouse.x;
          const dy = p.y + p.oy - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < MOUSE_RADIUS && d > 0.01) {
            const f = 1 - d / MOUSE_RADIUS;
            p.ox += (dx / d) * f * 3;
            p.oy += (dy / d) * f * 3;
          }
        }
        p.ox *= 0.94;
        p.oy *= 0.94;
        p.dx = p.x + p.ox;
        p.dy = p.y + p.oy;
      }

      // Liaisons entre particules proches
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const d = Math.hypot(a.dx - b.dx, a.dy - b.dy);
          if (d < LINK_DIST) {
            ctx.strokeStyle = `rgba(${COLOR}, ${(1 - d / LINK_DIST) * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(a.dx, a.dy);
            ctx.lineTo(b.dx, b.dy);
            ctx.stroke();
          }
        }
        // Liaison avec le curseur
        if (mouse.x !== null && !reduceMotion) {
          const dm = Math.hypot(a.dx - mouse.x, a.dy - mouse.y);
          if (dm < MOUSE_RADIUS * 1.3) {
            ctx.strokeStyle = `rgba(${COLOR}, ${(1 - dm / (MOUSE_RADIUS * 1.3)) * 0.5})`;
            ctx.beginPath();
            ctx.moveTo(a.dx, a.dy);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Points
      for (const p of particles) {
        ctx.fillStyle = `rgba(${COLOR}, 0.75)`;
        ctx.beginPath();
        ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    aside.addEventListener("pointermove", e => {
      const rect = aside.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    aside.addEventListener("pointerleave", () => { mouse.x = mouse.y = null; });

    new ResizeObserver(resize).observe(aside);
    resize();
    frame();
  }

  document.querySelectorAll(".auth-aside").forEach(initParticles);
})();