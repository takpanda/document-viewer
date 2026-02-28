/**
 * app.js – Main application controller
 * ======================================
 * Handles folder upload, sidebar toggle, theme switching,
 * and resize-handle interaction.
 */

const App = (() => {
  /* ---- DOM references ---- */

  const btnUpload = document.getElementById("btn-upload");
  const btnClear = document.getElementById("btn-clear");
  const btnTheme = document.getElementById("btn-theme");
  const btnSidebarToggle = document.getElementById("btn-sidebar-toggle");
  const folderInput = document.getElementById("folder-input");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const resizeHandle = document.getElementById("resize-handle");
  const previewPane = document.getElementById("preview-pane");
  const uploadProgress = document.getElementById("upload-progress");
  const uploadStatus = document.getElementById("upload-status");
  const uploadBar = document.getElementById("upload-bar");

  /* ==================================================================
   *  Folder upload
   * ================================================================== */

  btnUpload.addEventListener("click", () => folderInput.click());

  folderInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    // Show progress
    uploadProgress.classList.remove("hidden");
    uploadBar.style.width = "0%";
    uploadStatus.textContent = `アップロード中… (${files.length} ファイル)`;

    const formData = new FormData();
    for (const file of files) {
      formData.append("files[]", file);
      formData.append("paths[]", file.webkitRelativePath);
    }

    try {
      const xhr = new XMLHttpRequest();

      // Progress tracking
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          uploadBar.style.width = `${pct}%`;
          uploadStatus.textContent = `アップロード中… ${pct}%`;
        }
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/upload");
        xhr.send(formData);
      });

      uploadStatus.textContent = "アップロード完了！";
      uploadBar.style.width = "100%";

      // Reload tree
      await Tree.load();

      // Show clear button
      btnClear.classList.remove("hidden");

      // Hide progress after a short delay
      setTimeout(() => {
        uploadProgress.classList.add("hidden");
      }, 1500);
    } catch (err) {
      console.error("Upload error:", err);
      uploadStatus.textContent = `エラー: ${err.message}`;
      uploadBar.style.width = "0%";
      setTimeout(() => uploadProgress.classList.add("hidden"), 3000);
    }

    // Reset input so the same folder can be re-selected
    folderInput.value = "";
  });

  /* ==================================================================
   *  Clear files
   * ================================================================== */

  btnClear.addEventListener("click", async () => {
    if (!confirm("アップロードされたファイルをすべて削除しますか？")) return;

    try {
      await fetch("/api/files", { method: "DELETE" });
      await Tree.load();
      Preview.showWelcome();
      btnClear.classList.add("hidden");
    } catch (err) {
      console.error("Clear error:", err);
    }
  });

  /* ==================================================================
   *  Sidebar toggle (mobile)
   * ================================================================== */

  function toggleSidebar(open) {
    const isOpen = open !== undefined ? open : sidebar.dataset.open !== "true";
    sidebar.dataset.open = isOpen;
    if (isOpen) {
      sidebar.classList.remove("max-md:-translate-x-full");
      overlay.classList.remove("hidden");
    } else {
      sidebar.classList.add("max-md:-translate-x-full");
      overlay.classList.add("hidden");
    }
  }

  btnSidebarToggle.addEventListener("click", () => toggleSidebar());
  overlay.addEventListener("click", () => toggleSidebar(false));

  /* ==================================================================
   *  Dark / Light theme
   * ================================================================== */

  const iconSun = document.getElementById("icon-sun");
  const iconMoon = document.getElementById("icon-moon");
  const hljsLight = document.getElementById("hljs-light");
  const hljsDark = document.getElementById("hljs-dark");

  function _applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
    iconSun.classList.toggle("hidden", !dark);
    iconMoon.classList.toggle("hidden", dark);
    hljsLight.disabled = dark;
    hljsDark.disabled = !dark;
    localStorage.setItem("theme", dark ? "dark" : "light");
    Preview.syncTheme(dark);
  }

  // Initialise from localStorage or OS preference
  const savedTheme = localStorage.getItem("theme");
  const prefersDark =
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  _applyTheme(prefersDark);

  btnTheme.addEventListener("click", () => {
    _applyTheme(!document.documentElement.classList.contains("dark"));
  });

  /* ==================================================================
   *  Resize handle (desktop)
   * ================================================================== */

  let _resizing = false;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    _resizing = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!_resizing) return;
    const newWidth = Math.max(180, Math.min(e.clientX, 600));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (_resizing) {
      _resizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });

  /* ==================================================================
   *  Initial load
   * ================================================================== */

  // Load tree on page load (may have persisted uploads from Docker volume)
  Tree.load().then(() => {
    // If tree has entries, show clear button
    const hasEntries = document.querySelectorAll("#file-tree .tree-file").length > 0;
    if (hasEntries) {
      btnClear.classList.remove("hidden");
    }
  });

  return { toggleSidebar };
})();
