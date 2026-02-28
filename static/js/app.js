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
   *  Context menu – New Folder
   * ================================================================== */

  const ctxNewFolder = document.getElementById("ctx-new-folder");
  const ctxUploadFiles = document.getElementById("ctx-upload-files");
  const folderDialog = document.getElementById("folder-dialog");
  const folderNameInput = document.getElementById("folder-name-input");
  const folderDialogError = document.getElementById("folder-dialog-error");
  const folderDialogErrorText = document.getElementById("folder-dialog-error-text");
  const folderDialogParent = document.getElementById("folder-dialog-parent");
  const folderDialogCancel = document.getElementById("folder-dialog-cancel");
  const folderDialogCreate = document.getElementById("folder-dialog-create");
  const fileUploadInput = document.getElementById("file-upload-input");

  /** Open the "New Folder" dialog */
  ctxNewFolder.addEventListener("click", () => {
    Tree.hideContextMenu();
    folderNameInput.value = "";
    folderDialogError.classList.add("hidden");
    const parentPath = Tree.getContextPath();
    folderDialogParent.textContent = parentPath ? `作成先: /${parentPath}/` : "作成先: / (ルート)";
    folderDialog.classList.remove("hidden");
    setTimeout(() => folderNameInput.focus(), 50);
  });

  /** Cancel folder dialog */
  folderDialogCancel.addEventListener("click", () => {
    folderDialog.classList.add("hidden");
  });

  /** Close folder dialog on Escape */
  folderNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") folderDialog.classList.add("hidden");
    if (e.key === "Enter") folderDialogCreate.click();
  });

  /** Close dialog when clicking the overlay background */
  folderDialog.addEventListener("click", (e) => {
    if (e.target === folderDialog || e.target.classList.contains("dialog-overlay")) folderDialog.classList.add("hidden");
  });

  /** Create folder */
  folderDialogCreate.addEventListener("click", async () => {
    const name = folderNameInput.value.trim();
    if (!name) {
      folderDialogErrorText.textContent = "フォルダ名を入力してください";
      folderDialogError.classList.remove("hidden");
      return;
    }
    // Disallow invalid characters
    if (/[\/\\:*?"<>|]/.test(name) || name === "." || name === "..") {
      folderDialogErrorText.textContent = "使用できない文字が含まれています";
      folderDialogError.classList.remove("hidden");
      return;
    }

    const parentPath = Tree.getContextPath();
    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    try {
      const res = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        folderDialogErrorText.textContent = data.error || "作成に失敗しました";
        folderDialogError.classList.remove("hidden");
        return;
      }

      folderDialog.classList.add("hidden");
      await Tree.load();
      btnClear.classList.remove("hidden");
    } catch (err) {
      console.error("Create folder error:", err);
      folderDialogErrorText.textContent = "エラーが発生しました";
      folderDialogError.classList.remove("hidden");
    }
  });

  /* ==================================================================
   *  Context menu – Upload files to folder
   * ================================================================== */

  ctxUploadFiles.addEventListener("click", () => {
    Tree.hideContextMenu();
    fileUploadInput.value = "";
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    const targetPath = Tree.getContextPath();

    // Show progress
    uploadProgress.classList.remove("hidden");
    uploadBar.style.width = "0%";
    uploadStatus.textContent = `アップロード中… (${files.length} ファイル)`;

    const formData = new FormData();
    formData.append("target", targetPath);
    for (const file of files) {
      formData.append("files[]", file);
    }

    try {
      const xhr = new XMLHttpRequest();

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
        xhr.open("POST", "/api/upload-to");
        xhr.send(formData);
      });

      uploadStatus.textContent = "アップロード完了！";
      uploadBar.style.width = "100%";

      await Tree.load();
      btnClear.classList.remove("hidden");

      setTimeout(() => uploadProgress.classList.add("hidden"), 1500);
    } catch (err) {
      console.error("Upload-to error:", err);
      uploadStatus.textContent = `エラー: ${err.message}`;
      uploadBar.style.width = "0%";
      setTimeout(() => uploadProgress.classList.add("hidden"), 3000);
    }

    fileUploadInput.value = "";
  });

  /* ==================================================================
   *  Context menu – Delete item
   * ================================================================== */

  const ctxDelete = document.getElementById("ctx-delete");
  const deleteDialog = document.getElementById("delete-dialog");
  const deleteDialogMsg = document.getElementById("delete-dialog-msg");
  const deleteDialogPathText = document.getElementById("delete-dialog-path-text");
  const deleteDialogCancel = document.getElementById("delete-dialog-cancel");
  const deleteDialogConfirm = document.getElementById("delete-dialog-confirm");

  let _pendingDeletePath = "";
  let _pendingDeleteType = "";

  ctxDelete.addEventListener("click", () => {
    Tree.hideContextMenu();
    _pendingDeletePath = Tree.getContextPath();
    _pendingDeleteType = Tree.getContextType();

    if (!_pendingDeletePath) return;

    const name = _pendingDeletePath.split("/").pop();
    const kind = _pendingDeleteType === "directory" ? "フォルダ" : "ファイル";
    deleteDialogMsg.innerHTML = `${kind}<strong class="text-gray-900 dark:text-gray-100">「${_escHtml(name)}」</strong>を削除しますか？${_pendingDeleteType === "directory" ? "<br/><span class='text-red-500 dark:text-red-400 text-xs'>※ 中のファイルもすべて削除されます</span>" : ""}`;
    deleteDialogPathText.textContent = `/${_pendingDeletePath}`;
    deleteDialog.classList.remove("hidden");
  });

  deleteDialogCancel.addEventListener("click", () => {
    deleteDialog.classList.add("hidden");
  });

  deleteDialog.addEventListener("click", (e) => {
    if (e.target === deleteDialog || e.target.classList.contains("dialog-overlay")) deleteDialog.classList.add("hidden");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !deleteDialog.classList.contains("hidden")) {
      deleteDialog.classList.add("hidden");
    }
  });

  deleteDialogConfirm.addEventListener("click", async () => {
    if (!_pendingDeletePath) return;

    try {
      const res = await fetch("/api/item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: _pendingDeletePath, type: _pendingDeleteType }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "削除に失敗しました");
        deleteDialog.classList.add("hidden");
        return;
      }

      deleteDialog.classList.add("hidden");

      // If the deleted item was the currently previewed file, show welcome
      const selected = Tree.getSelectedPath();
      if (selected && (selected === _pendingDeletePath || selected.startsWith(_pendingDeletePath + "/"))) {
        Preview.showWelcome();
      }

      await Tree.load();

      // Hide clear button if tree is now empty
      const hasEntries = document.querySelectorAll("#file-tree .tree-file").length > 0 ||
                         document.querySelectorAll("#file-tree .tree-dir").length > 0;
      if (!hasEntries) btnClear.classList.add("hidden");
    } catch (err) {
      console.error("Delete error:", err);
      alert("削除中にエラーが発生しました");
      deleteDialog.classList.add("hidden");
    }
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
   *  Helpers
   * ================================================================== */

  function _escHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

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
