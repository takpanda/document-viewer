/**
 * app.js – Main application controller
 * ======================================
 * Handles folder upload, sidebar toggle, theme switching,
 * and resize-handle interaction.
 */

const App = (() => {
  /* ---- DOM references ---- */

  const btnUpload = document.getElementById("btn-upload");
  const btnUploadSkill = document.getElementById("btn-upload-skill");
  const btnTheme = document.getElementById("btn-theme");
  const btnSidebarToggle = document.getElementById("btn-sidebar-toggle");
  const folderInput = document.getElementById("folder-input");
  const skillFolderInput = document.getElementById("skill-folder-input");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const resizeHandle = document.getElementById("resize-handle");
  const previewPane = document.getElementById("preview-pane");
  const uploadProgress = document.getElementById("upload-progress");
  const uploadStatus = document.getElementById("upload-status");
  const uploadBar = document.getElementById("upload-bar");

  /* Tab elements */
  const tabDocs = document.getElementById("tab-docs");
  const tabSkills = document.getElementById("tab-skills");
  const panelDocs = document.getElementById("panel-docs");
  const panelSkills = document.getElementById("panel-skills");

  /* Skill upload dialog */
  const skillUploadDialog = document.getElementById("skill-upload-dialog");
  const skillAuthorInput = document.getElementById("skill-author-input");
  const skillUploadError = document.getElementById("skill-upload-error");
  const skillUploadErrorText = document.getElementById("skill-upload-error-text");
  const skillUploadCancel = document.getElementById("skill-upload-cancel");
  const skillUploadSelect = document.getElementById("skill-upload-select");

  /* ---- Current mode ---- */
  let _mode = "docs"; // "docs" | "skills"

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
   *  Tab switching – Documents / Skills
   * ================================================================== */

  function _switchMode(mode) {
    _mode = mode;

    // Update tab styles
    tabDocs.classList.toggle("tab-active", mode === "docs");
    tabSkills.classList.toggle("tab-active", mode === "skills");

    // Toggle panels
    panelDocs.classList.toggle("hidden", mode !== "docs");
    panelSkills.classList.toggle("hidden", mode !== "skills");

    // Toggle header buttons
    btnUpload.classList.toggle("hidden", mode !== "docs");
    btnUploadSkill.classList.toggle("hidden", mode !== "skills");

    // Reset preview pane
    const previewWelcome = document.getElementById("preview-welcome");
    const previewContent = document.getElementById("preview-content");
    const skillDetailPane = document.getElementById("skill-detail-pane");
    const breadcrumb = document.getElementById("breadcrumb");

    previewWelcome.classList.remove("hidden");
    previewContent.classList.add("hidden");
    skillDetailPane.classList.add("hidden");
    breadcrumb.classList.add("hidden");

    if (mode === "skills") {
      Skills.load();
    }
  }

  tabDocs.addEventListener("click", () => {
    _switchMode("docs");
    history.replaceState(null, "", "#docs");
  });
  tabSkills.addEventListener("click", () => {
    _switchMode("skills");
    history.replaceState(null, "", "#skills");
  });

  /* ==================================================================
   *  Skill upload
   * ================================================================== */

  /** Stored author name for the upload flow */
  let _skillAuthor = localStorage.getItem("skill-author") || "";

  btnUploadSkill.addEventListener("click", () => {
    skillAuthorInput.value = _skillAuthor;
    skillUploadError.classList.add("hidden");
    skillUploadDialog.classList.remove("hidden");
    setTimeout(() => {
      if (!_skillAuthor) skillAuthorInput.focus();
    }, 50);
  });

  skillUploadCancel.addEventListener("click", () => {
    skillUploadDialog.classList.add("hidden");
  });

  skillUploadDialog.addEventListener("click", (e) => {
    if (e.target === skillUploadDialog || e.target.classList.contains("dialog-overlay")) {
      skillUploadDialog.classList.add("hidden");
    }
  });

  skillAuthorInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") skillUploadDialog.classList.add("hidden");
    if (e.key === "Enter") skillUploadSelect.click();
  });

  skillUploadSelect.addEventListener("click", () => {
    const author = skillAuthorInput.value.trim();
    if (!author) {
      skillUploadErrorText.textContent = "投稿者名を入力してください";
      skillUploadError.classList.remove("hidden");
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(author)) {
      skillUploadErrorText.textContent = "英数字・ハイフン・アンダースコアのみ使用できます";
      skillUploadError.classList.remove("hidden");
      return;
    }

    _skillAuthor = author;
    localStorage.setItem("skill-author", author);
    skillUploadDialog.classList.add("hidden");
    skillFolderInput.click();
  });

  skillFolderInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    // Show progress
    uploadProgress.classList.remove("hidden");
    uploadBar.style.width = "0%";
    uploadStatus.textContent = `スキルをアップロード中… (${files.length} ファイル)`;

    const formData = new FormData();
    formData.append("author", _skillAuthor);
    for (const file of files) {
      formData.append("files[]", file);
      formData.append("paths[]", file.webkitRelativePath);
    }

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          uploadBar.style.width = `${pct}%`;
          uploadStatus.textContent = `スキルをアップロード中… ${pct}%`;
        }
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || `Upload failed: ${xhr.status}`));
            } catch (_) {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/skills/upload");
        xhr.send(formData);
      });

      uploadStatus.textContent = "スキルのアップロード完了！";
      uploadBar.style.width = "100%";

      // Reload skills
      await Skills.load();

      setTimeout(() => uploadProgress.classList.add("hidden"), 1500);
    } catch (err) {
      console.error("Skill upload error:", err);
      uploadStatus.textContent = `エラー: ${err.message}`;
      uploadBar.style.width = "0%";
      setTimeout(() => uploadProgress.classList.add("hidden"), 3000);
    }

    skillFolderInput.value = "";
  });

  /* ==================================================================
   *  Context menu – New Folder
   * ================================================================== */

  const ctxNewFolder = document.getElementById("ctx-new-folder");
  const ctxUploadFiles = document.getElementById("ctx-upload-files");
  const ctxRename = document.getElementById("ctx-rename");
  const folderDialog = document.getElementById("folder-dialog");
  const folderDialogTitle = document.getElementById("folder-dialog-title");
  const folderNameInput = document.getElementById("folder-name-input");
  const folderDialogError = document.getElementById("folder-dialog-error");
  const folderDialogErrorText = document.getElementById("folder-dialog-error-text");
  const folderDialogParent = document.getElementById("folder-dialog-parent");
  const folderDialogCancel = document.getElementById("folder-dialog-cancel");
  const folderDialogCreate = document.getElementById("folder-dialog-create");
  const folderDialogCreateLabel = document.getElementById("folder-dialog-create-label");
  const fileUploadInput = document.getElementById("file-upload-input");
  const btnNewRootFolder = document.getElementById("btn-new-root-folder");

  /** Tracks the parent path for the folder creation dialog */
  let _folderCreationParent = "";

  /** Tracks rename mode state */
  let _isRenaming = false;
  let _renameTargetPath = "";
  let _renameCurrentName = "";

  /** Open the "New Folder" dialog (from context menu) */
  ctxNewFolder.addEventListener("click", () => {
    Tree.hideContextMenu();
    _folderCreationParent = Tree.getContextPath();
    _openFolderDialog();
  });

  /** Open the "New Folder" dialog (from sidebar footer button – always root) */
  btnNewRootFolder.addEventListener("click", () => {
    _folderCreationParent = "";
    _openFolderDialog();
  });

  /** Open the "Rename Folder" dialog (from context menu) */
  ctxRename.addEventListener("click", () => {
    Tree.hideContextMenu();
    const targetPath = Tree.getContextPath();
    if (!targetPath) return;
    _renameTargetPath = targetPath;
    _renameCurrentName = targetPath.split("/").pop();
    _openFolderDialog({
      renaming: true,
      initialName: _renameCurrentName,
      parentLabel: `変更対象: /${targetPath}/`,
    });
  });

  /** Shared helper to show the folder creation/rename dialog.
   * @param {object} opts
   * @param {boolean} opts.renaming    – true = rename mode
   * @param {string}  opts.initialName – pre-filled value (rename mode)
   * @param {string}  opts.parentLabel – subtitle text   (rename mode)
   */
  function _openFolderDialog({ renaming = false, initialName = "", parentLabel = "" } = {}) {
    _isRenaming = renaming;
    folderNameInput.value = initialName;
    folderDialogError.classList.add("hidden");
    if (renaming) {
      folderDialogTitle.textContent = "フォルダ名を変更";
      folderDialogCreateLabel.textContent = "変更する";
      folderDialogParent.textContent = parentLabel;
    } else {
      folderDialogTitle.textContent = "新規フォルダ";
      folderDialogCreateLabel.textContent = "作成する";
      folderDialogParent.textContent = _folderCreationParent
        ? `作成先: /${_folderCreationParent}/`
        : "作成先: / (ルート)";
    }
    folderDialog.classList.remove("hidden");
    setTimeout(() => { folderNameInput.focus(); folderNameInput.select(); }, 50);
  }

  /** Cancel folder dialog */
  folderDialogCancel.addEventListener("click", () => {
    folderDialog.classList.add("hidden");
    _isRenaming = false;
  });

  /** Close folder dialog on Escape */
  folderNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { folderDialog.classList.add("hidden"); _isRenaming = false; }
    if (e.key === "Enter") folderDialogCreate.click();
  });

  /** Close dialog when clicking the overlay background */
  folderDialog.addEventListener("click", (e) => {
    if (e.target === folderDialog || e.target.classList.contains("dialog-overlay")) {
      folderDialog.classList.add("hidden");
      _isRenaming = false;
    }
  });

  /** Create folder / Rename folder */
  folderDialogCreate.addEventListener("click", async () => {
    const name = folderNameInput.value.trim();
    if (!name) {
      folderDialogErrorText.textContent = _isRenaming
        ? "新しいフォルダ名を入力してください"
        : "フォルダ名を入力してください";
      folderDialogError.classList.remove("hidden");
      return;
    }
    // Disallow invalid characters
    if (/[\/\\:*?"<>|]/.test(name) || name === "." || name === "..") {
      folderDialogErrorText.textContent = "使用できない文字が含まれています";
      folderDialogError.classList.remove("hidden");
      return;
    }

    if (_isRenaming) {
      // ---- Rename mode ----
      if (name === _renameCurrentName) {
        folderDialog.classList.add("hidden");
        _isRenaming = false;
        return;
      }
      try {
        const res = await fetch("/api/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: _renameTargetPath, new_name: name }),
        });
        const data = await res.json();
        if (!res.ok) {
          folderDialogErrorText.textContent = data.error || "変更に失敗しました";
          folderDialogError.classList.remove("hidden");
          return;
        }

        folderDialog.classList.add("hidden");
        _isRenaming = false;

        // プレビュー中のファイルがリネームしたフォルダ内にあれば再表示
        const selected = Tree.getSelectedPath();
        if (selected && (selected === _renameTargetPath || selected.startsWith(_renameTargetPath + "/"))) {
          const newPath = data.path + selected.slice(_renameTargetPath.length);
          Preview.showWelcome();
          await Tree.load();
          document.dispatchEvent(new CustomEvent("file-selected", { detail: { path: newPath } }));
          return;
        }

        await Tree.load();
      } catch (err) {
        console.error("Rename folder error:", err);
        folderDialogErrorText.textContent = "エラーが発生しました";
        folderDialogError.classList.remove("hidden");
      }
    } else {
      // ---- Create mode ----
      const parentPath = _folderCreationParent;
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
      } catch (err) {
        console.error("Create folder error:", err);
        folderDialogErrorText.textContent = "エラーが発生しました";
        folderDialogError.classList.remove("hidden");
      }
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

    } catch (err) {
      console.error("Delete error:", err);
      alert("削除中にエラーが発生しました");
      deleteDialog.classList.add("hidden");
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
   *  Drag & Drop – Move confirmation dialog
   * ================================================================== */

  const moveDialog = document.getElementById("move-dialog");
  const moveDialogMsg = document.getElementById("move-dialog-msg");
  const moveDialogSource = document.getElementById("move-dialog-source");
  const moveDialogDest = document.getElementById("move-dialog-dest");
  const moveDialogCancel = document.getElementById("move-dialog-cancel");
  const moveDialogConfirm = document.getElementById("move-dialog-confirm");

  let _pendingMove = null;

  /** Listen for move-requested events from Tree drag & drop */
  document.addEventListener("move-requested", (e) => {
    const { sourcePath, sourceType, sourceName, destPath, destName } = e.detail;
    _pendingMove = { sourcePath, sourceType, destPath };

    const kind = sourceType === "directory" ? "フォルダ" : "ファイル";
    moveDialogMsg.innerHTML = `${kind}<strong class="text-gray-900 dark:text-gray-100">「${_escHtml(sourceName)}」</strong>を移動しますか？`;
    moveDialogSource.textContent = `/${sourcePath}`;
    moveDialogDest.textContent = destPath ? `/${destPath}/` : "/ (ルート)";
    moveDialog.classList.remove("hidden");
  });

  moveDialogCancel.addEventListener("click", () => {
    moveDialog.classList.add("hidden");
    _pendingMove = null;
  });

  moveDialog.addEventListener("click", (e) => {
    if (e.target === moveDialog || e.target.classList.contains("dialog-overlay")) {
      moveDialog.classList.add("hidden");
      _pendingMove = null;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !moveDialog.classList.contains("hidden")) {
      moveDialog.classList.add("hidden");
      _pendingMove = null;
    }
  });

  moveDialogConfirm.addEventListener("click", async () => {
    if (!_pendingMove) return;

    const { sourcePath, sourceType, destPath } = _pendingMove;

    try {
      const res = await fetch("/api/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourcePath, destination: destPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "移動に失敗しました");
        moveDialog.classList.add("hidden");
        _pendingMove = null;
        return;
      }

      moveDialog.classList.add("hidden");
      _pendingMove = null;

      // If the moved item was the currently previewed file, reset preview
      const selected = Tree.getSelectedPath();
      if (selected && (selected === sourcePath || selected.startsWith(sourcePath + "/"))) {
        Preview.showWelcome();
      }

      await Tree.load();
    } catch (err) {
      console.error("Move error:", err);
      alert("移動中にエラーが発生しました");
      moveDialog.classList.add("hidden");
      _pendingMove = null;
    }
  });

  /* ==================================================================
   *  Initial load
   * ================================================================== */

  // Load tree on page load (may have persisted uploads from Docker volume)
  Tree.load();

  // Also load skills in background for quick tab switching
  Skills.load();

  // Restore state from URL hash (for direct link sharing)
  const _initialHash = window.location.hash;
  if (_initialHash.startsWith("#docs/")) {
    const filePath = decodeURIComponent(_initialHash.slice("#docs/".length));
    document.dispatchEvent(new CustomEvent("file-selected", { detail: { path: filePath } }));
  } else if (_initialHash.startsWith("#skills/")) {
    const rest = _initialHash.slice("#skills/".length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) {
      const author = decodeURIComponent(rest.slice(0, slashIdx));
      const skillName = decodeURIComponent(rest.slice(slashIdx + 1));
      _switchMode("skills");
      Skills.selectByName(author, skillName);
    }
  } else if (_initialHash === "#skills") {
    _switchMode("skills");
  }

  return { toggleSidebar, switchMode: _switchMode };
})();
