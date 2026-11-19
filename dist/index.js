// src/shader.ts
var VERTEX = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
var FRAGMENT = `precision highp float;
uniform sampler2D F;
uniform vec2 R;    // canvas size in px
uniform vec4 B;    // the field's square on the canvas: left, top, side in px; texels across the field
uniform float T;   // seconds
uniform vec3 P;    // pointer in field space, and how present it is
uniform vec3 W[6]; // rings: where each began in field space, and when
uniform vec4 S;    // shape: rim width, rim height, pool depth, swell height
uniform vec3 L;    // look: shadow strength, exposure, softness of the outline in px
uniform vec2 K;    // how plain the metal is (0 reflects the studio, 1 is light silver all over),
                   // and how dark its outer edge (1 for a light surface, 0 for a dark one)
uniform float Q;   // how far the liquid reaches with no pool to hold it: 1 for letters
const float RANGE = .1;
float texel(vec2 i){ vec4 t = texture2D(F, (i + .5) / B.w); return (t.r * 65280. + t.g * 255.) / 65535.; }
float sdf(vec2 u){
  vec2 p = u * B.w - .5, i = floor(p), f = p - i;
  float a = texel(i), b = texel(i + vec2(1, 0)), c = texel(i + vec2(0, 1)), d = texel(i + vec2(1, 1));
  return (mix(mix(a, b, f.x), mix(c, d, f.x), f.y) - .5) * 2. * RANGE;
}
float swell(vec2 u, float t){
  vec2 q = u + .06 * vec2(sin(u.y * 7. + t * .23), cos(u.x * 6. - t * .19));
  q += .025 * vec2(cos(q.y * 17. - t * .31), sin(q.x * 15. + t * .37));
  return sin(dot(q, vec2(9., 5.)) + t * .42) + .6 * sin(dot(q, vec2(-7., 12.)) - t * .33) + .3 * sin(dot(q, vec2(19., -14.)) + t * .5);
}
float rings(vec2 u){
  float h = 0.;
  for (int k = 0; k < 6; k++) {
    float age = T - W[k].z;
    if (age < 0. || age > 5.) continue;
    float r = length(u - W[k].xy), front = age * .3;
    h += sin((r - front) * 60.) * exp(-age) * smoothstep(front + .03, front - .02, r) * smoothstep(0., .06, front) / (1. + r * 7.);
  }
  return h;
}
float height(vec2 u){
  float d = sdf(u), w = S.x;
  float t = clamp(d / w, 0., 1.);
  float rim = sqrt(1. - (1. - t) * (1. - t));
  float pool = smoothstep(w * .95, w * 2., d);
  float h = w * S.y * (rim - S.z * pool);
  float inside = max(smoothstep(w * .8, w * 2.6, d) * S.z / .45, Q * smoothstep(0., w, d));
  h += .012 * smoothstep(0., .1, d) * inside;
  float liquid = swell(u, T) * S.w + rings(u) * .0028;
  liquid += P.z * .004 * exp(-dot(u - P.xy, u - P.xy) * 50.);
  return h + liquid * inside;
}
vec3 room(vec3 r){
  float y = r.y + .3 + .05 * sin(r.x * 3. + 1.);
  vec3 wall = mix(vec3(1.04, 1.02, 1.), vec3(.4, .44, .53), smoothstep(0., 1., y) * .75 + .25 * smoothstep(0., .35, y));
  wall *= 1. - .42 * smoothstep(.5, .57, y) * smoothstep(.8, .7, y);
  vec3 ground = mix(vec3(.035, .03, .04), vec3(.6, .47, .52), smoothstep(-.02, -.9, y));
  vec3 c = mix(ground, wall, smoothstep(-.012, .012, y));
  c += vec3(1.3, 1.25, 1.15) * smoothstep(.2, 0., length(vec2(r.x + .4, y - .95) * vec2(1., 2.4)));
  c += vec3(.4, .46, .6) * smoothstep(.3, 0., length(vec2(r.x - .6, y - .4) * vec2(2.2, 1.)));
  return c;
}
void main(){
  vec2 u = (vec2(gl_FragCoord.x, R.y - gl_FragCoord.y) - B.xy) / B.z;
  float e = 1.5 / B.w, d = sdf(u), h = height(u);
  vec3 n = normalize(vec3(h - height(u + vec2(e, 0)), h - height(u + vec2(0, e)), e));
  vec3 v = normalize(vec3((u - .5) * .25, 1.));
  vec3 r = reflect(-v, n);
  r.y = -r.y;
  r.xy += (P.xy - .5) * vec2(.35, -.35) * P.z;
  r = normalize(r);
  float ramp = mix(mix(mix(.76, .46, smoothstep(-.9, -.32, r.y)), .9, smoothstep(-.32, .02, r.y)), 1.07, smoothstep(.02, .5, r.y));
  float across = u.x * .8 + u.y;
  vec3 plain = vec3(.965, .985, 1.03) * (ramp + .1 * smoothstep(.15, 0., abs(across - .62)) - .07 * smoothstep(.3, 0., abs(across - 1.08)));
  float edge = 0.;
  if (K.y > 0.) {
    vec2 g = normalize(vec2(sdf(u + vec2(e, 0)) - d, sdf(u + vec2(0, e)) - d) + 1e-7);
    float reach = d;
    for (int k = 1; k <= 8; k++) reach = max(reach, sdf(u + g * S.x * float(k) * .2));
    edge = K.y * (1. - smoothstep(.3, .65, d / max(min(S.x, reach), 1e-4)));
    plain = mix(plain, vec3(.29, .297, .312) * (.875 + .25 * smoothstep(-.5, .5, r.y)), edge);
  }
  vec3 c = mix(room(r), plain, K.x);
  c = mix(c, vec3(1.), pow(1. - clamp(dot(n, v), 0., 1.), 4.) * .25 * (1. - edge)) * L.y;
  c = c / (1. + max(c.r, max(c.g, c.b)) * .12);
  c = pow(clamp(c, 0., 1.), vec3(.92));
  float soft = L.z / B.z, a = smoothstep(-soft, soft, d);
  float shadow = smoothstep(-.035, .01, sdf(u - vec2(.006, .012))) * L.x * (1. - a);
  gl_FragColor = vec4(c * a, a + shadow);
}`;
function createRenderer(canvas, field, keep = false) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: keep
  });
  if (!gl)
    return;
  const fail = () => {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  const texels = field.width;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
    const shader = gl.createShader(type);
    if (!shader) {
      fail();
      return;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    fail();
    return;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, field);
  for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, name, gl.NEAREST);
  for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
  const at = (name) => gl.getUniformLocation(program, name);
  const R = at("R"), B = at("B"), T = at("T"), P = at("P"), W = at("W"), S = at("S"), L = at("L"), K = at("K"), Q = at("Q");
  const rings = new Float32Array(18).fill(-99);
  let next = 0, live = true;
  return {
    ring(x, y, time) {
      rings.set([x, y, time], next * 3);
      next = (next + 1) % 6;
    },
    draw({ box, time, pointer, shape, shadow, exposure, plain, edge, liquid }) {
      if (!live)
        return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(R, canvas.width, canvas.height);
      gl.uniform4f(B, box[0], box[1], box[2], texels);
      gl.uniform1f(T, time);
      gl.uniform3fv(P, pointer);
      gl.uniform3fv(W, rings);
      gl.uniform4fv(S, shape);
      gl.uniform3f(L, shadow, exposure, 1.2);
      gl.uniform2f(K, plain, edge);
      gl.uniform1f(Q, liquid);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    release() {
      live = false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  };
}

// src/options.ts
var DEFAULTS = {
  band: 0.3,
  shape: [0.012, 1.05, 0, 0.003],
  budget: 400000,
  margin: 800
};
function isDark(theme, systemDark) {
  return theme === "auto" ? systemDark : theme === "dark";
}
function edgeFor(finish, dark) {
  if (finish === "edged")
    return 1;
  if (finish === "plain")
    return 0;
  return dark ? 0 : 1;
}
function chooseMode({ reducedMotion, saveData, webgl }) {
  return reducedMotion || saveData || !webgl ? "still" : "live";
}
var SETTLE = { calm: 3.5, fall: 1 };
function pace(previous, since, elapsed) {
  return since < SETTLE.calm ? 1 : Math.max(0, previous - elapsed / SETTLE.fall);
}
function canvasSize(width, height, ratio, budget = DEFAULTS.budget) {
  const scale = Math.min(ratio > 0 ? ratio : 1, 2, Math.sqrt(budget / Math.max(width * height, 1)));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}
function lettering(side, dark, edge = dark ? 0 : 1, time = 3, pointer = [0.5, 0.5, 0], band = DEFAULTS.band, shape = DEFAULTS.shape) {
  return { box: [0, -side * (0.5 - band / 2), side], time, pointer, shape, shadow: dark ? 0.35 : 0.13, exposure: 0.98, plain: 1, edge, liquid: 1 };
}
function fieldPoint(clientX, clientY, box, band = DEFAULTS.band) {
  const width = box.width || 1;
  return [(clientX - box.left) / width, (clientY - box.top) / width + 0.5 - band / 2];
}
function checkOptions(opts) {
  if (typeof opts.field !== "string" && !(opts.field instanceof URL))
    throw new TypeError("quicksilver: `field` must be a URL or string");
  const stills = opts.stills;
  if (!stills || typeof stills !== "object")
    throw new TypeError("quicksilver: `stills` must be { light, dark }");
  for (const key of ["light", "dark"]) {
    const value = stills[key];
    if (typeof value !== "string" && !(value instanceof URL))
      throw new TypeError(`quicksilver: \`stills.${key}\` must be a URL or string`);
  }
  if (opts.theme !== undefined && !["auto", "light", "dark"].includes(opts.theme))
    throw new TypeError("quicksilver: `theme` must be auto, light or dark");
  if (opts.finish !== undefined && !["auto", "edged", "plain"].includes(opts.finish))
    throw new TypeError("quicksilver: `finish` must be auto, edged or plain");
  if (opts.band !== undefined && !(typeof opts.band === "number" && opts.band > 0 && opts.band <= 1))
    throw new TypeError("quicksilver: `band` must be a number in (0, 1]");
}

// src/index.ts
var href = (value) => String(value);
function mount(anchor, opts) {
  checkOptions(opts);
  const element = anchor;
  const doc = anchor.ownerDocument;
  const view = doc.defaultView;
  if (!view)
    throw new Error("quicksilver: the element is not in a window");
  const band = opts.band ?? DEFAULTS.band;
  const finish = opts.finish ?? "auto";
  let theme = opts.theme ?? "auto";
  const signal = new AbortController;
  const stopped = () => signal.signal.aborted;
  const systemDark = view.matchMedia("(prefers-color-scheme: dark)");
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const dark = () => isDark(theme, systemDark.matches);
  let owned;
  let still = anchor.querySelector("img");
  if (!still) {
    owned = doc.createElement("picture");
    owned.className = "quicksilver-still";
    still = doc.createElement("img");
    still.alt = "";
    still.decoding = "async";
    owned.append(still);
    anchor.prepend(owned);
  }
  const img = still;
  const sources = [...img.closest("picture")?.querySelectorAll("source") ?? []];
  const original = { src: img.getAttribute("src"), media: sources.map((source) => source.getAttribute("media")) };
  const restore = () => {
    if (original.src === null)
      img.removeAttribute("src");
    else
      img.setAttribute("src", original.src);
    sources.forEach((source, i) => {
      const media = original.media[i];
      if (media === null || media === undefined)
        source.removeAttribute("media");
      else
        source.setAttribute("media", media);
    });
  };
  const fillStill = () => {
    if (owned) {
      owned.querySelector("source")?.remove();
      if (theme === "auto") {
        const source = doc.createElement("source");
        source.media = "(prefers-color-scheme: dark)";
        source.srcset = href(opts.stills.dark);
        owned.prepend(source);
      }
    } else {
      restore();
      if (theme === "auto")
        return;
      for (const source of sources)
        source.media = "not all";
    }
    img.src = href(theme === "auto" || theme === "light" ? opts.stills.light : opts.stills.dark);
  };
  fillStill();
  const hadData = anchor.dataset["quicksilver"];
  const hadClass = anchor.classList.contains("quicksilver");
  anchor.classList.add("quicksilver");
  anchor.dataset["quicksilver"] = "still";
  element.addEventListener("click", (event) => opts.onActivate?.(event), { signal: signal.signal });
  if (anchor instanceof view.HTMLAnchorElement) {
    anchor.addEventListener("keydown", (event) => {
      if (event.key !== " " || event.repeat || event.defaultPrevented)
        return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
        return;
      event.preventDefault();
      anchor.click();
    }, { signal: signal.signal });
  }
  let settled = false, settle = () => {
    return;
  };
  const ready = new Promise((done) => {
    settle = done;
  });
  const conclude = (mode) => {
    if (settled)
      return;
    settled = true;
    settle(mode);
  };
  let canvas;
  let renderer;
  let frame = 0;
  let redraw = () => {
    return;
  };
  const phase = new AbortController;
  const observers = [];
  const toStill = () => {
    phase.abort();
    if (frame)
      view.cancelAnimationFrame(frame);
    frame = 0;
    for (const observer of observers.splice(0))
      observer.disconnect();
    renderer?.release();
    renderer = undefined;
    canvas?.remove();
    canvas = undefined;
    if (!stopped())
      anchor.dataset["quicksilver"] = "still";
    conclude("still");
  };
  const gone = () => phase.signal.aborted;
  const on = { signal: phase.signal, passive: true };
  const live = async () => {
    const saveData = Boolean(view.navigator.connection?.saveData);
    if (chooseMode({ reducedMotion: motion.matches, saveData, webgl: "WebGLRenderingContext" in view }) === "still")
      return "still";
    await new Promise((near) => {
      phase.signal.addEventListener("abort", () => {
        near();
      }, { once: true });
      const watch = new view.IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting))
          return;
        watch.disconnect();
        near();
      }, { rootMargin: `${String(DEFAULTS.margin)}px 0px` });
      observers.push(watch);
      watch.observe(anchor);
    });
    if (gone())
      return "still";
    const image = new view.Image;
    image.crossOrigin = "anonymous";
    image.src = href(opts.field);
    await image.decode();
    const field = await view.createImageBitmap(image, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    if (gone() || motion.matches) {
      field.close();
      return "still";
    }
    canvas = doc.createElement("canvas");
    canvas.className = "quicksilver-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    renderer = createRenderer(canvas, field);
    field.close();
    if (!renderer) {
      canvas = undefined;
      return "still";
    }
    const surface = canvas, mark = renderer;
    anchor.append(surface);
    const now = () => view.performance.now() / 1000;
    let visible = false, shown = false, touched = 0, before = 0, clock = 3, speed = 0, over = 0;
    let aim = [0.5, 0.5], lean = [0.5, 0.5, 0], last = [9, 9, 0];
    const draw = () => {
      frame = 0;
      if (!visible || doc.hidden || !renderer)
        return;
      const time = now();
      if (!shown)
        touched = before = time;
      speed = pace(speed, time - touched, time - before);
      clock += speed * Math.min(time - before, 0.1);
      before = time;
      const resting = speed === 0;
      lean = resting ? [aim[0], aim[1], over] : [lean[0] + (aim[0] - lean[0]) * 0.08, lean[1] + (aim[1] - lean[1]) * 0.08, lean[2] + (over - lean[2]) * 0.06];
      const isDarkNow = dark();
      mark.draw(lettering(surface.width, isDarkNow, edgeFor(finish, isDarkNow), clock, lean, band));
      if (!shown) {
        shown = true;
        anchor.dataset["quicksilver"] = "live";
        conclude("live");
      }
      if (!resting)
        frame = view.requestAnimationFrame(draw);
    };
    const wake = () => {
      if (!frame && renderer)
        frame = view.requestAnimationFrame(draw);
    };
    redraw = wake;
    const measure = () => {
      const { width, height } = surface.getBoundingClientRect();
      [surface.width, surface.height] = canvasSize(width, height, view.devicePixelRatio);
      wake();
    };
    const ratio = () => {
      const query = view.matchMedia(`(resolution: ${String(view.devicePixelRatio)}dppx)`);
      query.addEventListener("change", () => {
        measure();
        ratio();
      }, { once: true, signal: phase.signal });
    };
    ratio();
    const point = (event, press) => {
      const [x, y] = fieldPoint(event.clientX, event.clientY, surface.getBoundingClientRect(), band);
      over = 1;
      aim = [x, y];
      const time = now();
      touched = time;
      if (press || Math.hypot(x - last[0], y - last[1]) > 0.05 && time - last[2] > 0.12) {
        mark.ring(x, y, clock);
        last = [x, y, time];
      }
      wake();
    };
    element.addEventListener("pointermove", (event) => {
      point(event, false);
    }, on);
    element.addEventListener("pointerdown", (event) => {
      point(event, true);
    }, on);
    element.addEventListener("pointerleave", () => {
      over = 0;
      touched = now();
      wake();
    }, on);
    const seen = new view.IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      wake();
    });
    seen.observe(anchor);
    const sized = new view.ResizeObserver(measure);
    sized.observe(anchor);
    observers.push(seen, sized);
    doc.addEventListener("visibilitychange", wake, on);
    systemDark.addEventListener("change", wake, on);
    surface.addEventListener("webglcontextlost", toStill, on);
    measure();
    return "live";
  };
  motion.addEventListener("change", () => {
    if (motion.matches)
      toStill();
  }, { signal: signal.signal });
  live().catch(() => "still").then((mode) => {
    if (mode === "still")
      toStill();
  });
  return {
    ready,
    setTheme(next) {
      checkOptions({ field: opts.field, stills: opts.stills, theme: next });
      theme = next;
      fillStill();
      redraw();
    },
    destroy() {
      signal.abort();
      toStill();
      owned?.remove();
      if (!owned)
        restore();
      if (!hadClass)
        anchor.classList.remove("quicksilver");
      if (hadData === undefined)
        delete anchor.dataset["quicksilver"];
      else
        anchor.dataset["quicksilver"] = hadData;
    }
  };
}
export {
  mount,
  lettering,
  isDark,
  edgeFor,
  chooseMode,
  canvasSize,
  SETTLE,
  DEFAULTS
};

//# debugId=3E4625A56A171E8164756E2164756E21
