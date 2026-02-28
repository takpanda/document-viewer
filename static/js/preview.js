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

  // Apply configuration
  if (markedLib.use) {
    markedLib.use({
      gfm: true,
      breaks: false,
      renderer: codeRenderer,
    });
  } else if (markedLib.setOptions) {
    const renderer = new markedLib.Renderer();
    renderer.code = codeRenderer.code;
    markedLib.setOptions({ renderer, gfm: true, breaks: false });
  }

  // Initialize Mermaid
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    securityLevel: "loose",
  });

  /* ---- DOM references ---- */

  const welcomeEl = document.getElementById("preview-welcome");
  const contentEl = document.getElementById("preview-content");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const previewPane = document.getElementById("preview-pane");

  /* ---- State ---- */
  let _currentPath = null;

  /* ---- Core ---- */

  async function showFile(filePath) {
    _currentPath = filePath;

    // Check if this is a non-text file (image, etc.)
    if (/\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i.test(filePath)) {
      _showImage(filePath);
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

    // Scroll to top
    previewPane.scrollTop = 0;
  }

  function _renderPlainText(text, _filePath) {
    const highlighted = hljs.highlightAuto(text).value;
    contentEl.innerHTML = `<pre><code class="hljs">${highlighted}</code></pre>`;
    _showContent();
    previewPane.scrollTop = 0;
  }

  function _showImage(filePath) {
    _showBreadcrumb(filePath);
    contentEl.innerHTML = `
      <div class="flex items-center justify-center py-8">
        <img src="/api/file/${encodeURI(filePath)}" alt="${_esc(filePath)}" class="max-w-full rounded shadow" />
      </div>
    `;
    _showContent();
    previewPane.scrollTop = 0;
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
  }

  /* ---- Breadcrumb ---- */

  function _showBreadcrumb(filePath) {
    const parts = filePath.split("/");
    breadcrumbEl.innerHTML = parts
      .map((p, i) => {
        const isLast = i === parts.length - 1;
        return isLast
          ? `<span class="text-gray-800 dark:text-gray-200 font-medium">${_esc(p)}</span>`
          : `<span>${_esc(p)}</span><span class="mx-1 text-gray-300 dark:text-gray-600">/</span>`;
      })
      .join("");
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
    showFile(e.detail.path);
  });

  return { showFile, showWelcome, syncTheme };
})();
