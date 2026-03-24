/**
 * preview.js – Markdown preview component
 * =========================================
 * Listens for "file-selected" events, fetches the Markdown source via
 * /api/file/<path>, converts it to HTML with marked.js, applies
 * syntax highlighting with highlight.js, and renders Mermaid diagrams.
 */

const Preview = (() => {
  /* ---- Utility (declared early – used by renderer) ---- */

  function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /* ---- marked.js configuration ---- */

  // Determine marked API: v12+ uses marked.use(), older uses marked.setOptions()
  const markedLib = (typeof marked === "object" && marked.parse) ? marked
                  : (typeof marked === "function") ? marked : null;

  if (!markedLib) {
    console.error("marked.js is not loaded!");
  }

  // Custom renderer for code blocks (Mermaid + highlight.js)
  const codeRenderer = {
    code(token) {
      // Handle both token-object style (v12+) and legacy style
      const text = (typeof token === "object") ? (token.text || "") : (arguments[0] || "");
      const lang = (typeof token === "object") ? (token.lang || "") : (arguments[1] || "");
      const langLower = lang.toLowerCase();

      // Mermaid diagrams → rendered later by mermaid.run()
      // NOTE: Do NOT escape mermaid source – mermaid.js needs raw text
      if (langLower === "mermaid") {
        return `<div class="mermaid">${text}</div>`;
      }

      // Syntax highlighting with highlight.js
      if (langLower && hljs.getLanguage(langLower)) {
        try {
          const highlighted = hljs.highlight(text, { language: langLower }).value;
          return `<pre><code class="hljs language-${_esc(langLower)}">${highlighted}</code></pre>`;
        } catch (e) { /* fall through */ }
      }

      // Auto-detect language
      try {
        const highlighted = hljs.highlightAuto(text).value;
        return `<pre><code class="hljs">${highlighted}</code></pre>`;
      } catch (e) {
        return `<pre><code>${_esc(text)}</code></pre>`;
      }
    },
  };

  // Custom renderer for headings – attach sequential IDs for TOC anchors
  // Sequential IDs (heading-1, heading-2, …) are safe for Japanese / any text
  let _headingCounter = 0;
  const headingRenderer = {
    heading(token) {
      const text  = (typeof token === "object") ? (token.text  || "") : String(arguments[0] || "");
      const depth = (typeof token === "object") ? (token.depth || 1) : Number(arguments[1] || 1);
      _headingCounter++;
      return `<h${depth} id="heading-${_headingCounter}">${text}</h${depth}>\n`;
    },
  };

  // Apply configuration
  if (markedLib.use) {
    markedLib.use({
      gfm: true,
      breaks: false,
      renderer: { ...codeRenderer, ...headingRenderer },
    });
  } else if (markedLib.setOptions) {
    const renderer = new markedLib.Renderer();
    renderer.code = codeRenderer.code;
    renderer.heading = headingRenderer.heading;
    markedLib.setOptions({ renderer, gfm: true, breaks: false });
  }

  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    securityLevel: "loose",
  });

  /* ---- DOM references ---- */

  const welcomeEl    = document.getElementById("preview-welcome");
  const contentEl    = document.getElementById("preview-content");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const previewScroll = document.getElementById("preview-scroll");
  const tocSidebar   = document.getElementById("toc-sidebar");
  const tocNav       = document.getElementById("toc-nav");

  /* ---- State ---- */
  let _currentPath = null;
  let _tocObserver = null;

  /* ---- Core ---- */

  async function showFile(filePath) {
    _currentPath = filePath;

    // Check if this is a non-text file (image, etc.)
    if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(filePath)) {
      _showImage(filePath);
      return;
    }

    // HTML files → sandboxed iframe preview
    if (/\.html?$/i.test(filePath)) {
      _renderHtml(filePath);
      return;
    }

    try {
      const res = await fetch(`/api/file/${encodeURI(filePath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      // Show breadcrumb
      _showBreadcrumb(filePath);

      if (/\.md$/i.test(filePath)) {
        _renderMarkdown(text, filePath);
      } else {
        _renderPlainText(text, filePath);
      }
    } catch (err) {
      console.error("Failed to load file:", err);
      contentEl.innerHTML = `<div class="text-red-500 p-4">ファイルの読み込みに失敗しました: ${_esc(err.message)}</div>`;
      _showContent();
    }
  }

  function _renderMarkdown(source, filePath) {
    // Reset heading counter for sequential anchor IDs
    _headingCounter = 0;
    // Resolve relative image paths
    const basePath = filePath.substring(0, filePath.lastIndexOf("/") + 1);
    const html = markedLib.parse(source);

    // Rewrite relative image src to /api/file/...
    const processed = html.replace(
      /(<img\s[^>]*src=")(?!https?:\/\/|\/api\/)([^"]+)(")/gi,
      (_, pre, src, post) => {
        const resolved = _resolvePath(basePath, src);
        return `${pre}/api/file/${encodeURI(resolved)}${post}`;
      }
    );

    contentEl.innerHTML = processed;
    _showContent();

    // Render Mermaid diagrams
    _renderMermaid();

    // Build table of contents
    _buildTOC();

    // Scroll to top
    previewScroll.scrollTop = 0;
  }

  function _renderPlainText(text, _filePath) {
    const highlighted = hljs.highlightAuto(text).value;
    contentEl.innerHTML = `<pre><code class="hljs">${highlighted}</code></pre>`;
    _showContent();
    _hideTOC();
    previewScroll.scrollTop = 0;
  }

  function _renderHtml(filePath) {
    _showBreadcrumb(filePath);
    contentEl.innerHTML = `
      <iframe
        src="/api/html-preview/${encodeURI(filePath)}"
        sandbox="allow-scripts allow-same-origin allow-forms"
        class="w-full border-0 rounded"
        style="height: 80vh;"
        title="${_esc(filePath)}"
      ></iframe>
    `;
    _showContent();
    _hideTOC();
    previewScroll.scrollTop = 0;
  }

  function _showImage(filePath) {
    _showBreadcrumb(filePath);
    contentEl.innerHTML = `
      <div class="flex items-center justify-center py-8">
        <img src="/api/file/${encodeURI(filePath)}" alt="${_esc(filePath)}" class="max-w-full rounded shadow" />
      </div>
    `;
    _showContent();
    _hideTOC();
    previewScroll.scrollTop = 0;
  }

  /* ---- TOC (Table of Contents) ---- */

  function _buildTOC() {
    // Disconnect previous intersection observer
    if (_tocObserver) {
      _tocObserver.disconnect();
      _tocObserver = null;
    }

    const headings = Array.from(contentEl.querySelectorAll("h2, h3"));
    if (headings.length < 2) {
      _hideTOC();
      return;
    }

    // Build anchor list (H3 indented relative to H2)
    tocNav.innerHTML = headings.map((h) => {
      const isH3 = h.tagName === "H3";
      return `<a href="#${h.id}" class="toc-item${isH3 ? " toc-item-h3" : ""}" data-toc-id="${h.id}">${h.textContent}</a>`;
    }).join("");

    // Smooth scroll on click
    tocNav.querySelectorAll("a.toc-item").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.getElementById(a.dataset.tocId);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      });
    });

    // Highlight active heading via IntersectionObserver
    _tocObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((en) => en.isIntersecting);
        if (!visible.length) return;
        // Highlight the topmost visible heading
        const topEntry = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        tocNav.querySelectorAll("a.toc-item").forEach((a) => a.classList.remove("toc-active"));
        const activeLink = tocNav.querySelector(`a[data-toc-id="${topEntry.target.id}"]`);
        if (activeLink) activeLink.classList.add("toc-active");
      },
      { root: previewScroll, rootMargin: "-80px 0px -50% 0px", threshold: 0 }
    );
    headings.forEach((h) => _tocObserver.observe(h));

    tocSidebar.classList.remove("hidden");
  }

  function _hideTOC() {
    if (_tocObserver) {
      _tocObserver.disconnect();
      _tocObserver = null;
    }
    tocSidebar.classList.add("hidden");
    tocNav.innerHTML = "";
  }

  async function _renderMermaid() {
    const mermaidDivs = contentEl.querySelectorAll("div.mermaid");
    if (!mermaidDivs.length) return;

    // Assign unique IDs for mermaid rendering
    mermaidDivs.forEach((div, i) => {
      div.id = `mermaid-${Date.now()}-${i}`;
    });

    try {
      // mermaid.run() API: try NodeList first, then selector fallback
      if (typeof mermaid.run === "function") {
        await mermaid.run({ nodes: mermaidDivs });
      } else {
        // Older mermaid versions: use mermaid.init()
        mermaid.init(undefined, mermaidDivs);
      }
    } catch (err) {
      console.warn("Mermaid rendering error:", err);
      // Show raw source on error so user can see the diagram definition
      mermaidDivs.forEach((div) => {
        if (!div.querySelector("svg")) {
          div.classList.add("text-left", "text-xs", "text-red-500");
          div.textContent = "⚠ Mermaid render error: " + div.textContent.substring(0, 100);
        }
      });
    }

    // Initialize zoom/pan for rendered diagrams
    _initMermaidZoom(mermaidDivs);
  }

  function _initMermaidZoom(mermaidDivs) {
    mermaidDivs.forEach((container) => {
      const svg = container.querySelector("svg");
      if (!svg) return;

      // Remove any previous toolbar
      const oldToolbar = container.querySelector(".mermaid-toolbar");
      if (oldToolbar) oldToolbar.remove();

      // Inject toolbar
      const toolbar = document.createElement("div");
      toolbar.className = "mermaid-toolbar";
      toolbar.innerHTML = `
        <button class="mermaid-zoom-in"  title="ズームイン">＋</button>
        <button class="mermaid-zoom-out" title="ズームアウト">－</button>
        <button class="mermaid-reset"    title="リセット">⊙</button>
      `;
      container.appendChild(toolbar);

      // State
      let scale = 1, tx = 0, ty = 0;
      let isDragging = false, lastX = 0, lastY = 0;
      let wheelEnabled = false; // ホイールズームのON/OFF
      let hasMoved = false;     // ドラッグ判定用
      // Touch
      let lastTouchDist = null;
      let lastTouchMidX = 0, lastTouchMidY = 0;

      // SVG の元サイズを viewBox から取得（ベクター品質を保つ拡縮のベースとして使用）
      const vb = svg.viewBox.baseVal;
      function _svgOrigDim(vbVal, attr) {
        return vbVal || parseFloat(svg.getAttribute(attr)) || svg.getBoundingClientRect()[attr];
      }
      const origW = _svgOrigDim(vb && vb.width,  "width");
      const origH = _svgOrigDim(vb && vb.height, "height");

      // mermaid が設定する max-width 制約を解除し、width/height を自前で管理する
      svg.style.maxWidth = "none";

      // Fit SVG to container width if it overflows
      const containerW = container.clientWidth - 32;
      if (origW > 0 && origW > containerW) {
        scale = containerW / origW;
      }
      applyTransform();

      function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

      function applyTransform() {
        // CSS scale() ではなく width/height を直接変更することで SVG をベクターとして再レンダリングし、
        // 拡大時にボヤけが生じないようにする
        if (origW > 0) svg.style.width  = (origW * scale) + "px";
        if (origH > 0) svg.style.height = (origH * scale) + "px";
        svg.style.transform = `translate(${tx}px, ${ty}px)`;
        container.style.minHeight = (origH * scale + 32) + "px";
      }

      function zoomAt(clientX, clientY, factor) {
        const rect = container.getBoundingClientRect();
        const mx = clientX - rect.left - 16;
        const my = clientY - rect.top  - 16;
        const newScale = clamp(scale * factor, 0.1, 5);
        tx = mx - (mx - tx) * (newScale / scale);
        ty = my - (my - ty) * (newScale / scale);
        scale = newScale;
        applyTransform();
      }

      // ---- Wheel zoom toggle ----
      function toggleWheelZoom(on) {
        wheelEnabled = (on !== undefined) ? on : !wheelEnabled;
        container.classList.toggle("mermaid-zoom-active", wheelEnabled);
      }

      // 図の外クリックで解除
      const _outsideClickHandler = (e) => {
        if (wheelEnabled && !container.contains(e.target)) {
          toggleWheelZoom(false);
        }
      };
      document.addEventListener("mousedown", _outsideClickHandler);

      // ---- Wheel zoom ----
      container.addEventListener("wheel", (e) => {
        if (!wheelEnabled) return; // 無効時はページスクロールに委ねる
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomAt(e.clientX, e.clientY, factor);
      }, { passive: false });

      // ---- Mouse drag ----
      container.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        hasMoved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        container.style.cursor = "grabbing";
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (!hasMoved && Math.hypot(dx, dy) > 4) hasMoved = true;
        tx += dx;
        ty += dy;
        lastX = e.clientX;
        lastY = e.clientY;
        applyTransform();
      });
      window.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        container.style.cursor = "grab";
        // ドラッグなしのクリックでホイールズームをトグル
        if (!hasMoved) toggleWheelZoom();
      });

      // ---- Double-click reset ----
      container.addEventListener("dblclick", () => {
        scale = 1; tx = 0; ty = 0;
        applyTransform();
      });

      // ---- Touch (pinch zoom + pan) ----
      container.addEventListener("touchstart", (e) => {
        if (e.touches.length === 2) {
          const [a, b] = e.touches;
          lastTouchDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
          lastTouchMidX = (a.clientX + b.clientX) / 2;
          lastTouchMidY = (a.clientY + b.clientY) / 2;
        } else if (e.touches.length === 1) {
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          lastTouchDist = null;
        }
        e.preventDefault();
      }, { passive: false });

      container.addEventListener("touchmove", (e) => {
        if (e.touches.length === 2) {
          const [a, b] = e.touches;
          const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
          const midX = (a.clientX + b.clientX) / 2;
          const midY = (a.clientY + b.clientY) / 2;
          if (lastTouchDist) {
            zoomAt(midX, midY, dist / lastTouchDist);
          }
          lastTouchDist = dist;
          lastTouchMidX = midX;
          lastTouchMidY = midY;
        } else if (e.touches.length === 1 && lastTouchDist === null) {
          tx += e.touches[0].clientX - lastX;
          ty += e.touches[0].clientY - lastY;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          applyTransform();
        }
        e.preventDefault();
      }, { passive: false });

      container.addEventListener("touchend", (e) => {
        if (e.touches.length < 2) lastTouchDist = null;
      });

      // ---- Toolbar buttons ----
      toolbar.querySelector(".mermaid-zoom-in").addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = container.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
      });
      toolbar.querySelector(".mermaid-zoom-out").addEventListener("click", (e) => {
        e.stopPropagation();
        const rect = container.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.85);
      });
      toolbar.querySelector(".mermaid-reset").addEventListener("click", (e) => {
        e.stopPropagation();
        scale = 1; tx = 0; ty = 0;
        applyTransform();
      });
    });
  }

  /* ---- Breadcrumb ---- */

  function _showBreadcrumb(filePath) {
    const parts = filePath.split("/");
    const pathHtml = parts
      .map((p, i) => {
        const isLast = i === parts.length - 1;
        return isLast
          ? `<span class="text-gray-800 dark:text-gray-200 font-medium">${_esc(p)}</span>`
          : `<span>${_esc(p)}</span><span class="mx-1 text-gray-300 dark:text-gray-600">/</span>`;
      })
      .join("");
    breadcrumbEl.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center min-w-0 overflow-hidden flex-wrap gap-y-0.5">${pathHtml}</div>
        <button class="breadcrumb-copy-btn shrink-0 ml-3 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="リンクをコピー">
          <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>
        </button>
      </div>
    `;
    const copyBtn = breadcrumbEl.querySelector(".breadcrumb-copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          copyBtn.innerHTML = `<svg class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>`;
          }, 2000);
        });
      });
    }
    breadcrumbEl.classList.remove("hidden");
  }

  /* ---- Visibility helpers ---- */

  function _showContent() {
    welcomeEl.classList.add("hidden");
    contentEl.classList.remove("hidden");
  }

  function showWelcome() {
    welcomeEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    breadcrumbEl.classList.add("hidden");
    _hideTOC();
    _currentPath = null;
  }

  /* ---- Path resolution ---- */

  function _resolvePath(base, relative) {
    if (relative.startsWith("/")) return relative.slice(1);
    const parts = (base + relative).split("/");
    const resolved = [];
    for (const p of parts) {
      if (p === "..") resolved.pop();
      else if (p !== "." && p !== "") resolved.push(p);
    }
    return resolved.join("/");
  }

  /* ---- Theme sync ---- */

  function syncTheme(dark) {
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "default",
      securityLevel: "loose",
    });
    // Re-render current file if it contains mermaid
    if (_currentPath && /\.md$/i.test(_currentPath)) {
      showFile(_currentPath);
    }
  }

  /* ---- Event listeners ---- */

  document.addEventListener("file-selected", (e) => {
    history.replaceState(null, "", "#docs/" + e.detail.path);
    showFile(e.detail.path);
  });

  return { showFile, showWelcome, syncTheme };
})();
