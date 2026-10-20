(() => {
  const stage = document.querySelector(".stage");
  const envelope = document.getElementById("envelope");
  const shadow = envelope.querySelector(".envelope__shadow");
  const flap = document.getElementById("flap");
  const seal = document.getElementById("seal");
  const hit = document.getElementById("open");
  const letter = document.getElementById("letter");
  const letterShadow = letter.querySelector(".letter__shadow");
  const agree = document.getElementById("agree");
  const title = document.getElementById("title");
  const message = document.getElementById("message");
  const heartBeat = message.querySelector(".message__beat");
  const closeBtn = document.getElementById("close");

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Пози конверта відносно базової геометрії фрейму 11 (відкритий).
  // Фрейм 13 — закритий, фрейм 14 — після «Я згодна».
  const CLOSED = { xPercent: 1.38, yPercent: -54.33, scale: 301 / 461, rotation: 0 };
  const OPEN = { xPercent: 0, yPercent: 0, scale: 1, rotation: 3.39 };
  const ACCEPTED = { xPercent: -0.015, yPercent: -16.774, scale: 465.55 / 461, rotation: 3.39 };

  // Пози листа відносно конверта.
  const LETTER_IN = { xPercent: 1.76, yPercent: 55.05, rotation: 0 };
  const LETTER_OUT = { xPercent: 0, yPercent: 0, rotation: -3.39 };
  const LETTER_BACK = { xPercent: 7.629, yPercent: 75.985, rotation: -3.39 };

  // Висота нижнього лівого кута конверта у фігма-пікселях.
  const CORNER_OPEN = 658.27;
  const CORNER_ACCEPTED = 600.04;

  const OPEN_TILT = (OPEN.rotation * Math.PI) / 180;

  // closed → opening → open → accepting → accepted → closing → closed
  let state = "closed";
  let idle;
  let closing;

  // На високих телефонах під сценою 360×600 лишається вільне місце. Тоді
  // конверт опускаємо, щоб він, як у макеті, заходив за нижній край.
  function bleed(cornerY, max) {
    const u = stage.offsetHeight / 600;
    const below = (window.innerHeight - stage.offsetHeight) / 2 / u;
    return { u, shift: Math.min(Math.max(600 + below + 6 - cornerY, 0), max) };
  }

  // Лист компенсує зсув і лишається там само, де на фреймі 11.
  function openPose() {
    const { u, shift } = bleed(CORNER_OPEN, 60);
    return {
      envelope: { ...OPEN, yPercent: OPEN.yPercent + (shift * u * 100) / envelope.offsetHeight },
      letter: {
        ...LETTER_OUT,
        xPercent: (-shift * Math.sin(OPEN_TILT) * u * 100) / letter.offsetWidth,
        yPercent: (-shift * Math.cos(OPEN_TILT) * u * 100) / letter.offsetHeight,
      },
    };
  }

  // Тут лист усередині, тож опускається разом із конвертом.
  function acceptedPose() {
    const { u, shift } = bleed(CORNER_ACCEPTED, 140);
    return {
      envelope: { ...ACCEPTED, yPercent: ACCEPTED.yPercent + (shift * u * 100) / envelope.offsetHeight },
      letter: LETTER_BACK,
    };
  }

  /* ---------- блискітки ---------- */

  function drawSparkles() {
    const layers = document.querySelectorAll(".sparkles__layer");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const total = Math.round((w * h) / 210);
    const share = [0.72, 0.14, 0.14];

    layers.forEach((canvas, i) => {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      const count = Math.round(total * share[i]);
      for (let n = 0; n < count; n++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 0.3 + Math.pow(Math.random(), 4) * (i ? 1.1 : 0.8);
        ctx.globalAlpha = 0.25 + Math.random() * 0.75;
        ctx.fillStyle = Math.random() < 0.8 ? "#ffffff" : "#ffd9d2";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // дрібне зерно, як у фреймі 14, — тільки в нерухомому шарі
      if (i === 0) {
        ctx.fillStyle = "#ffffff";
        const grain = Math.round((w * h) / 150);
        for (let n = 0; n < grain; n++) {
          const s = 0.6 + Math.random() * 0.6;
          ctx.globalAlpha = 0.3 + Math.random() * 0.45;
          ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
        }
      }
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawSparkles();
      const pose = state === "open" ? openPose() : state === "accepted" ? acceptedPose() : null;
      if (pose) {
        gsap.set(envelope, pose.envelope);
        gsap.set(letter, pose.letter);
      }
    }, 150);
  });
  drawSparkles();

  /* ---------- написи штрихом ---------- */

  // Кожен вектор складається з відрізків векторної мережі Фігми. Ділимо на
  // підшляхи й малюємо з постійною швидкістю пера: відрізок, що починається
  // там, де закінчився попередній, іде слідом, а відгалуження — паралельно.
  function buildWriting(svg, selector, seconds) {
    const tl = gsap.timeline({ paused: true });
    const strokes = [];

    svg.querySelectorAll(selector).forEach((source) => {
      const pieces = source
        .getAttribute("d")
        .split(/(?=M)/)
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("class", source.getAttribute("class"));
          p.setAttribute("d", d);
          source.parentNode.insertBefore(p, source);
          return p;
        });
      source.remove();
      strokes.push(pieces);
    });

    const totalLength = strokes.flat().reduce((sum, p) => sum + p.getTotalLength(), 0);
    const speed = totalLength / seconds;
    let cursor = 0;

    strokes.forEach((pieces) => {
      const reached = [];
      const find = (pt) => reached.find((r) => Math.hypot(r.x - pt.x, r.y - pt.y) < 0.8);
      const mark = (pt, t) => {
        const hit = find(pt);
        if (!hit) reached.push({ x: pt.x, y: pt.y, t });
        else if (t < hit.t) hit.t = t;
      };

      let prevEnd = null;
      let prevEndTime = cursor;

      pieces.forEach((p) => {
        const len = p.getTotalLength();
        const a = p.getPointAtLength(0);
        const b = p.getPointAtLength(len);

        let start;
        if (prevEnd && Math.hypot(prevEnd.x - a.x, prevEnd.y - a.y) < 0.8) start = prevEndTime;
        else start = find(a)?.t ?? prevEndTime;

        const dur = Math.max(len / speed, 0.03);
        gsap.set(p, { strokeDasharray: `${len} ${len + 2}`, strokeDashoffset: len + 1 });
        tl.to(p, { strokeDashoffset: 0, duration: dur, ease: "none" }, start);

        mark(a, start);
        mark(b, start + dur);
        prevEnd = b;
        prevEndTime = start + dur;
      });

      // перо відривається між словами
      cursor = tl.duration() + 0.14;
    });

    return tl;
  }

  const writing = buildWriting(title, ".title__stroke", 2.6);
  const messageWriting = buildWriting(message, ".message__stroke", 2.6);

  /* ---------- поява ---------- */

  gsap.set(flap, { transformOrigin: "50% 0%", rotationX: 0 });
  gsap.set(seal, { transformOrigin: "50% 50%" });
  gsap.set(letter, LETTER_IN);

  const syncFlap = () => {
    flap.classList.toggle("is-open", gsap.getProperty(flap, "rotationX") > 90);
  };

  function startIdle() {
    if (state !== "closed" || reduceMotion) return;
    idle = gsap
      .timeline({ repeat: -1, repeatDelay: 2.6, delay: 0.6 })
      .to(seal, { scale: 1.08, duration: 0.45, ease: "sine.inOut" })
      .to(seal, { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.45)" })
      .to(envelope, { rotation: -1.4, duration: 0.14, ease: "sine.inOut" }, 0.1)
      .to(envelope, { rotation: 1, duration: 0.16, ease: "sine.inOut" })
      .to(envelope, { rotation: 0, duration: 0.9, ease: "elastic.out(1, 0.35)" });
  }

  const intro = gsap.timeline({ paused: true, onComplete: startIdle });

  if (reduceMotion) {
    gsap.set(envelope, { ...CLOSED, autoAlpha: 1 });
    writing.progress(1);
  } else {
    const persp = Math.max(window.innerWidth, window.innerHeight) * 1.6;

    intro
      .set(envelope, {
        ...CLOSED,
        yPercent: CLOSED.yPercent + 140,
        scale: CLOSED.scale * 0.92,
        rotation: -9,
        rotationX: 32,
        transformPerspective: persp,
        autoAlpha: 1,
      })
      .set(shadow, { opacity: 0 })
      .to(envelope, { yPercent: CLOSED.yPercent, scale: CLOSED.scale, rotationX: 0, duration: 1.5, ease: "expo.out" })
      .to(envelope, { rotation: 0, duration: 1.7, ease: "back.out(1.6)" }, 0)
      .to(shadow, { opacity: 1, duration: 1.2, ease: "power2.out" }, 0.25)
      .add(() => gsap.set(envelope, { transformPerspective: 0 }))
      .to(writing, { progress: 1, duration: writing.duration(), ease: "sine.inOut" }, 0.55);
  }

  /* ---------- відкриття ---------- */

  function open() {
    if (state !== "closed") return;
    state = "opening";

    intro.progress(1);
    if (closing) closing.progress(1);
    if (idle) idle.kill();
    gsap.killTweensOf([envelope, seal, flap]);

    envelope.classList.add("is-opened");
    letter.inert = false;

    const pose = openPose();
    const tl = gsap.timeline({
      onComplete: () => {
        state = "open";
        letter.focus({ preventScroll: true });
      },
    });

    tl
      // натиск на печатку
      .to(seal, { scale: 0.88, duration: 0.16, ease: "power2.out" }, 0)
      .to(seal, { scale: 1, duration: 0.5, ease: "back.out(3)" }, 0.16)
      .to(title, { autoAlpha: 0, yPercent: -10, duration: 0.8, ease: "power2.inOut" }, 0.05)
      .to(envelope, { rotation: 0, duration: 0.3, ease: "power2.out" }, 0)

      // клапан підіймається в 3D
      .to(flap, { rotationX: 180, duration: 1.2, ease: "power2.inOut", onUpdate: syncFlap }, 0.2)

      // ледь осідає, а тоді наближається й повертається
      .to(envelope, { scale: CLOSED.scale * 0.965, yPercent: CLOSED.yPercent + 2, duration: 0.6, ease: "power2.out" }, 0.18)
      .to(envelope, { ...pose.envelope, duration: 2, ease: "expo.inOut" }, 0.8)
      .to(shadow, { opacity: 0, duration: 1.4, ease: "power1.inOut" }, 1)

      // лист виїжджає й вирівнюється
      .to(letter, { ...pose.letter, duration: 2, ease: "power3.inOut" }, 1.45)
      .to(letterShadow, { opacity: 1, duration: 1.4, ease: "power1.inOut" }, 1.8);

    if (reduceMotion) tl.timeScale(1.8);
  }

  /* ---------- «Я згодна» ---------- */

  function accept() {
    if (state !== "open") return;
    state = "accepting";
    letter.inert = true;

    const pose = acceptedPose();
    messageWriting.progress(0);
    gsap.set(message, { autoAlpha: 1 });

    const tl = gsap.timeline({
      onComplete: () => {
        state = "accepted";
        closeBtn.focus({ preventScroll: true });
      },
    });

    tl
      .to(agree, { scale: 0.93, duration: 0.14, ease: "power2.out" }, 0)
      .to(agree, { scale: 1, duration: 0.5, ease: "back.out(3)" }, 0.14)

      // лист ховається назад у конверт, конверт трохи підіймається
      .to(letter, { ...pose.letter, duration: 1.6, ease: "power3.inOut" }, 0.3)
      .to(envelope, { ...pose.envelope, duration: 1.8, ease: "power3.inOut" }, 0.35)

      // «Дуже чекаю на зустріч» і серце
      .to(messageWriting, { progress: 1, duration: messageWriting.duration(), ease: "sine.inOut" }, 1.2)
      .to(heartBeat, { scale: 1.3, transformOrigin: "50% 50%", duration: 0.2, yoyo: true, repeat: 3, ease: "sine.inOut" })

      .fromTo(
        closeBtn,
        { autoAlpha: 0, scale: 0.4, rotation: -120 },
        { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.9, ease: "back.out(1.7)" },
        2.4
      );

    if (reduceMotion) tl.timeScale(1.8);
  }

  /* ---------- назад до закритого конверта ---------- */

  function close() {
    if (state !== "accepted") return;
    state = "closing";

    closing = gsap.timeline({
      onComplete: () => {
        closing = null;
        startIdle();
      },
    });

    closing
      .to(closeBtn, { autoAlpha: 0, scale: 0.5, rotation: 120, duration: 0.5, ease: "power2.in" }, 0)
      .to(message, { autoAlpha: 0, duration: 0.6, ease: "power1.inOut" }, 0.05)

      // клапан закривається, конверт віддаляється
      .to(flap, { rotationX: 0, duration: 1.2, ease: "power2.inOut", onUpdate: syncFlap }, 0.3)
      .to(envelope, { ...CLOSED, duration: 2, ease: "expo.inOut" }, 0.45)
      .to(shadow, { opacity: 1, duration: 1.2, ease: "power1.inOut" }, 1.3)

      // поки клапан закритий, лист непомітно повертається на старт
      .set(letter, LETTER_IN, 1.5)
      .set(letterShadow, { opacity: 0 }, 1.5)
      .set(agree, { clearProps: "transform" }, 1.5)

      // «Відкрий мене» пишеться знову
      .add(() => writing.progress(0), 1.6)
      .set(title, { autoAlpha: 1, yPercent: 0 }, 1.6)
      .add(() => {
        state = "closed";
        envelope.classList.remove("is-opened");
      }, 2.45)
      .to(writing, { progress: 1, duration: writing.duration(), ease: "sine.inOut" }, 1.7);

    if (reduceMotion) closing.timeScale(1.8);
  }

  hit.addEventListener("click", open);
  agree.addEventListener("click", accept);
  closeBtn.addEventListener("click", close);

  if (canHover) {
    hit.addEventListener("pointerenter", () => {
      if (state !== "closed") return;
      gsap.to(flap, { rotationX: 16, duration: 0.7, ease: "power3.out" });
    });
    hit.addEventListener("pointerleave", () => {
      if (state !== "closed") return;
      gsap.to(flap, { rotationX: 0, duration: 0.7, ease: "power3.out" });
    });
  }

  /* ---------- старт після завантаження картинок ---------- */

  const images = [...document.querySelectorAll(".stage img, .close img")];
  Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))).then(() => {
    requestAnimationFrame(() => intro.play());
  });
})();
