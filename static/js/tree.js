/**
 * tree.js – File-tree component
 * ==============================
 * Fetches the directory structure from /api/tree and renders an
 * interactive, collapsible tree in #file-tree.
 */

const Tree = (() => {
  /** Currently selected file path */
  let _selectedPath = null;

  /** Path of folder currently targeted by context menu (empty string = root) */
  let _contextPath = "";

  /** Type of item targeted by context menu: "directory" | "file" | "root" */
  let _contextType = "root";

  /** Current drag data */
  let _dragData = null;

  /** Remove all drop-target highlights */
  function _clearAllDropHighlights() {
    document.querySelectorAll(".tree-drop-target").forEach(el => el.classList.remove("tree-drop-target"));
    const treeEl = document.getElementById("file-tree");
    if (treeEl) treeEl.classList.remove("tree-drop-target-root");
  }

  /* ---- Icon helpers ---- */

  const ICONS = {
    folderClosed: `<svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>`,
    folderOpen: `<svg class="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/></svg>`,
    chevronRight: `<svg class="w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>`,
    file: `<svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>`,
    markdown: `<svg class="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3h13.7zM9 11V5H7.5v3.5L6 7l-1.5 1.5V5H3v6h1.5l1.5-2 1.5 2H9zm2.99-1.5L9.5 7h1.5V5h2v2h1.5l-2.51 2.5z"/></svg>`,
  };

  function _iconForFile(name) {
    if (/\.md$/i.test(name)) return ICONS.markdown;
    return ICONS.file;
  }

  /* ---- Rendering ---- */

  /**
   * Render a single tree node (directory or file).
   * @param {object} node   – { name, type, path, children? }
   * @param {number} depth  – nesting level (for indentation)
   * @returns {HTMLElement}
   */
  function _renderNode(node, depth = 0) {
    if (node.type === "directory") {
      return _renderDir(node, depth);
    }
    return _renderFile(node, depth);
  }

  function _renderDir(node, depth) {
    const wrapper = document.createElement("div");
    wrapper.className = "tree-dir";
    wrapper.dataset.path = node.path;
    wrapper.dataset.type = "directory";

    // Header row
    const row = document.createElement("div");
    row.className =
      "tree-row flex items-center gap-1.5 px-2 py-[3px] cursor-pointer select-none rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700/40 transition-colors";
    row.style.paddingLeft = `${depth * 16 + 8}px`;
    row.setAttribute("draggable", "true");
    row.innerHTML = `
      <span class="chevron">${ICONS.chevronRight}</span>
      <span class="folder-icon">${ICONS.folderClosed}</span>
      <span class="truncate text-gray-700 dark:text-gray-300">${_esc(node.name)}</span>
    `;

    const childContainer = document.createElement("div");
    childContainer.className = "tree-children hidden";
    if (node.children) {
      for (const child of node.children) {
        childContainer.appendChild(_renderNode(child, depth + 1));
      }
    }

    // Toggle expand / collapse
    row.addEventListener("click", () => {
      const open = childContainer.classList.toggle("hidden");
      const chevron = row.querySelector(".chevron svg");
      const folderIcon = row.querySelector(".folder-icon");
      if (!open) {
        chevron.style.transform = "rotate(90deg)";
        folderIcon.innerHTML = ICONS.folderOpen;
      } else {
        chevron.style.transform = "";
        folderIcon.innerHTML = ICONS.folderClosed;
      }
    });

    // Context menu on folder row
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      _contextPath = node.path;
      _contextType = "directory";
      _showContextMenu(e.clientX, e.clientY);
    });

    /* ---- Drag & Drop ---- */
    row.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      _dragData = { path: node.path, type: "directory", name: node.name };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.path);
      row.classList.add("tree-dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("tree-dragging");
      _clearAllDropHighlights();
    });

    // This folder is a drop target
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_dragData && _dragData.path !== node.path) {
        e.dataTransfer.dropEffect = "move";
        row.classList.add("tree-drop-target");
      }
    });
    row.addEventListener("dragleave", (e) => {
      e.stopPropagation();
      row.classList.remove("tree-drop-target");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("tree-drop-target");
      if (_dragData && _dragData.path !== node.path) {
        // Dispatch move-requested event for app.js to handle with confirmation dialog
        document.dispatchEvent(new CustomEvent("move-requested", {
          detail: {
            sourcePath: _dragData.path,
            sourceType: _dragData.type,
            sourceName: _dragData.name,
            destPath: node.path,
            destName: node.name,
          }
        }));
      }
      _dragData = null;
    });

    wrapper.appendChild(row);
    wrapper.appendChild(childContainer);
    return wrapper;
  }

  function _renderFile(node, depth) {
    const row = document.createElement("div");
    row.className =
      "tree-row tree-file flex items-center gap-1.5 px-2 py-[3px] cursor-pointer select-none rounded-md hover:bg-gray-200/60 dark:hover:bg-gray-700/40 transition-colors";
    row.style.paddingLeft = `${depth * 16 + 8 + 20}px`; // extra indent for alignment
    row.dataset.path = node.path;
    row.dataset.type = "file";
    row.setAttribute("draggable", "true");
    row.innerHTML = `
      ${_iconForFile(node.name)}
      <span class="truncate text-gray-700 dark:text-gray-300">${_esc(node.name)}</span>
    `;

    row.addEventListener("click", () => {
      _select(row, node.path);
    });

    // Context menu on file row
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      _contextPath = node.path;
      _contextType = "file";
      _showContextMenu(e.clientX, e.clientY);
    });

    /* ---- Drag (file as source) ---- */
    row.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      _dragData = { path: node.path, type: "file", name: node.name };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.path);
      row.classList.add("tree-dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("tree-dragging");
      _clearAllDropHighlights();
    });

    return row;
  }

  function _select(rowEl, path) {
    // Deselect previous
    document.querySelectorAll("#file-tree .tree-file").forEach((el) => {
      el.classList.remove("bg-blue-100", "dark:bg-blue-900/30", "font-medium");
    });
    // Highlight new
    rowEl.classList.add("bg-blue-100", "dark:bg-blue-900/30", "font-medium");
    _selectedPath = path;

    // Close sidebar on mobile
    const sidebar = document.getElementById("sidebar");
    if (sidebar && sidebar.dataset.open === "true") {
      App.toggleSidebar(false);
    }

    // Dispatch custom event with the selected file path
    document.dispatchEvent(new CustomEvent("file-selected", { detail: { path } }));
  }

  /* ---- Context menu helpers ---- */

  function _showContextMenu(x, y) {
    const menu = document.getElementById("ctx-menu");
    if (!menu) return;

    // Toggle visibility of menu items based on context type
    const newFolderBtn = document.getElementById("ctx-new-folder");
    const uploadBtn = document.getElementById("ctx-upload-files");
    const deleteBtn = document.getElementById("ctx-delete");
    const separator = deleteBtn ? deleteBtn.previousElementSibling : null;

    if (_contextType === "file") {
      // File: only show delete
      newFolderBtn && (newFolderBtn.classList.add("hidden"));
      uploadBtn && (uploadBtn.classList.add("hidden"));
      separator && (separator.classList.add("hidden"));
      deleteBtn && (deleteBtn.classList.remove("hidden"));
    } else if (_contextType === "directory") {
      // Folder: show all
      newFolderBtn && (newFolderBtn.classList.remove("hidden"));
      uploadBtn && (uploadBtn.classList.remove("hidden"));
      separator && (separator.classList.remove("hidden"));
      deleteBtn && (deleteBtn.classList.remove("hidden"));
    } else {
      // Root: show new folder & upload only
      newFolderBtn && (newFolderBtn.classList.remove("hidden"));
      uploadBtn && (uploadBtn.classList.remove("hidden"));
      separator && (separator.classList.add("hidden"));
      deleteBtn && (deleteBtn.classList.add("hidden"));
    }

    menu.classList.remove("hidden");
    // Position – keep within viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    menu.style.left = `${Math.min(x, vw - 200)}px`;
    menu.style.top = `${Math.min(y, vh - 100)}px`;
  }

  function _hideContextMenu() {
    const menu = document.getElementById("ctx-menu");
    if (menu) menu.classList.add("hidden");
  }

  // Close context menu on click outside / Escape
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("ctx-menu");
    if (menu && !menu.contains(e.target)) _hideContextMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") _hideContextMenu();
  });

  // Root-level context menu on empty area of file-tree
  document.addEventListener("DOMContentLoaded", () => {
    const treeEl = document.getElementById("file-tree");
    if (treeEl) {
      treeEl.addEventListener("contextmenu", (e) => {
        // Only trigger if click is directly on #file-tree or #tree-empty, not on a child row
        if (e.target === treeEl || e.target.id === "tree-empty" || e.target.closest("#tree-empty")) {
          e.preventDefault();
          _contextPath = "";
          _contextType = "root";
          _showContextMenu(e.clientX, e.clientY);
        }
      });

      /* ---- Drop on root (empty area of tree) ---- */
      treeEl.addEventListener("dragover", (e) => {
        // Only handle if the event target is #file-tree itself or #tree-empty
        if (e.target === treeEl || e.target.id === "tree-empty" || e.target.closest("#tree-empty")) {
          e.preventDefault();
          if (_dragData) {
            e.dataTransfer.dropEffect = "move";
            treeEl.classList.add("tree-drop-target-root");
          }
        }
      });
      treeEl.addEventListener("dragleave", (e) => {
        if (e.target === treeEl || e.target.id === "tree-empty" || e.target.closest("#tree-empty")) {
          treeEl.classList.remove("tree-drop-target-root");
        }
      });
      treeEl.addEventListener("drop", (e) => {
        if (e.target === treeEl || e.target.id === "tree-empty" || e.target.closest("#tree-empty")) {
          e.preventDefault();
          treeEl.classList.remove("tree-drop-target-root");
          if (_dragData) {
            document.dispatchEvent(new CustomEvent("move-requested", {
              detail: {
                sourcePath: _dragData.path,
                sourceType: _dragData.type,
                sourceName: _dragData.name,
                destPath: "",
                destName: "ルート",
              }
            }));
          }
          _dragData = null;
        }
      });
    }
  });

  /* ---- Public API ---- */

  async function load() {
    const treeEl = document.getElementById("file-tree");
    const emptyEl = document.getElementById("tree-empty");

    try {
      const res = await fetch("/api/tree");
      const data = await res.json();

      if (!data.length) {
        emptyEl && (emptyEl.classList.remove("hidden"));
        return;
      }

      // Clear existing tree (keep empty state hidden)
      emptyEl && emptyEl.classList.add("hidden");
      treeEl.querySelectorAll(".tree-dir, .tree-file").forEach((el) => el.remove());

      const fragment = document.createDocumentFragment();
      for (const node of data) {
        fragment.appendChild(_renderNode(node, 0));
      }
      treeEl.appendChild(fragment);
    } catch (err) {
      console.error("Failed to load tree:", err);
    }
  }

  function getSelectedPath() {
    return _selectedPath;
  }

  /* ---- Utility ---- */
  function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  return { load, getSelectedPath, getContextPath: () => _contextPath, getContextType: () => _contextType, hideContextMenu: _hideContextMenu };
})();
