/**
 * skills.js – Skills sharing component
 * =======================================
 * Handles skill listing, searching, detail preview, upload, and download
 * for sharing GitHub Copilot agent skills between users.
 */

const Skills = (() => {
  /* ---- State ---- */
  let _skills = [];
  let _selectedSkill = null;

  /* ---- Likes ---- */
  const LIKED_KEY = "skill-likes";

  function _getLikedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]")); }
    catch (_) { return new Set(); }
  }

  function _isLiked(author, skillName) {
    return _getLikedSet().has(`${author}/${skillName}`);
  }

  function _setLiked(author, skillName) {
    const s = _getLikedSet();
    s.add(`${author}/${skillName}`);
    localStorage.setItem(LIKED_KEY, JSON.stringify([...s]));
  }

  async function _likeSkill(author, skillName) {
    if (_isLiked(author, skillName)) return;

    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(author)}/${encodeURIComponent(skillName)}/like`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = await res.json();
      _setLiked(author, skillName);

      // Update cached skill data
      const cached = _skills.find(s => s.author === author && s.skill_name === skillName);
      if (cached) cached.likes = data.likes;

      _updateLikeButtons(author, skillName, data.likes);
    } catch (err) {
      console.error("Like error:", err);
    }
  }

  function _updateLikeButtons(author, skillName, newCount) {
    // Card button
    const cardBtn = skillsList.querySelector(
      `.skill-like-btn[data-author="${author}"][data-skill-name="${skillName}"]`
    );
    if (cardBtn) {
      cardBtn.querySelector(".skill-like-count").textContent = newCount;
      cardBtn.classList.remove("text-gray-400", "hover:text-pink-400");
      cardBtn.classList.add("text-pink-500");
      cardBtn.querySelector("svg").setAttribute("fill", "currentColor");
    }
    // Detail page button
    const detailBtn = skillDetailPane.querySelector(".skill-like-btn");
    if (detailBtn) {
      detailBtn.querySelector(".skill-like-count").textContent = newCount;
      detailBtn.classList.remove("border-gray-200", "dark:border-gray-700", "text-gray-600", "dark:text-gray-400", "hover:bg-gray-50", "dark:hover:bg-gray-800/50");
      detailBtn.classList.add("border-pink-300", "dark:border-pink-700", "text-pink-600", "dark:text-pink-400", "bg-pink-50", "dark:bg-pink-900/20");
      detailBtn.querySelector("svg").setAttribute("fill", "currentColor");
    }
  }

  /* ---- DOM references ---- */
  const skillsList = document.getElementById("skills-list");
  const skillsEmpty = document.getElementById("skills-empty");
  const skillsSearch = document.getElementById("skills-search");
  const previewWelcome = document.getElementById("preview-welcome");
  const previewContent = document.getElementById("preview-content");
  const skillDetailPane = document.getElementById("skill-detail-pane");
  const breadcrumbEl = document.getElementById("breadcrumb");

  /* ---- Utility ---- */
  function _esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function _formatDate(iso) {
    if (!iso) return "不明";
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
  }

  /* ---- API ---- */

  async function load(query = "") {
    try {
      const url = query ? `/api/skills?q=${encodeURIComponent(query)}` : "/api/skills";
      const res = await fetch(url);
      _skills = await res.json();
      _render();
    } catch (err) {
      console.error("Failed to load skills:", err);
    }
  }

  /* ---- Rendering ---- */

  function _render() {
    // Clear old cards
    skillsList.querySelectorAll(".skill-card").forEach(el => el.remove());

    if (!_skills.length) {
      skillsEmpty.classList.remove("hidden");
      return;
    }
    skillsEmpty.classList.add("hidden");

    const fragment = document.createDocumentFragment();
    for (const skill of _skills) {
      fragment.appendChild(_renderCard(skill));
    }
    skillsList.appendChild(fragment);
  }

  function _renderCard(skill) {
    const card = document.createElement("div");
    card.className = "skill-card group p-3 mx-2 mb-2 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150";
    card.dataset.author = skill.author;
    card.dataset.skillName = skill.skill_name;

    const liked = _isLiked(skill.author, skill.skill_name);
    card.innerHTML = `
      <div class="flex items-start gap-2">
        <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-gradient-to-br from-violet-500/20 to-blue-500/20 dark:from-violet-500/30 dark:to-blue-500/30">
          <svg class="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">${_esc(skill.name || skill.skill_name)}</span>
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">${_esc(skill.author)}</div>
          ${skill.description ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">${_esc(skill.description)}</p>` : ""}
          <div class="flex items-center mt-1.5">
            <button class="skill-like-btn flex items-center gap-0.5 text-xs rounded px-1 py-0.5 ${liked ? "text-pink-500" : "text-gray-400 hover:text-pink-400"} transition-colors"
                    data-author="${_esc(skill.author)}" data-skill-name="${_esc(skill.skill_name)}">
              <svg class="w-3 h-3" fill="${liked ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V2.75a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.25M6.633 10.25H5.25a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h1.383z"/></svg>
              <span class="skill-like-count">${skill.likes || 0}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const likeBtn = card.querySelector(".skill-like-btn");
    likeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _likeSkill(skill.author, skill.skill_name);
    });

    card.addEventListener("click", () => _selectSkill(skill));
    return card;
  }

  /* ---- Skill selection ---- */

  async function _selectSkill(skill) {
    _selectedSkill = skill;

    // Highlight selected card
    skillsList.querySelectorAll(".skill-card").forEach(el => {
      el.classList.remove("bg-blue-50", "dark:bg-blue-900/20", "border-blue-200", "dark:border-blue-800");
      el.classList.add("border-transparent");
    });
    const selectedCard = skillsList.querySelector(`.skill-card[data-author="${skill.author}"][data-skill-name="${skill.skill_name}"]`);
    if (selectedCard) {
      selectedCard.classList.remove("border-transparent");
      selectedCard.classList.add("bg-blue-50", "dark:bg-blue-900/20", "border-blue-200", "dark:border-blue-800");
    }

    // Close sidebar on mobile
    const sidebar = document.getElementById("sidebar");
    if (sidebar && sidebar.dataset.open === "true") {
      App.toggleSidebar(false);
    }

    // Show skill detail
    await _showSkillDetail(skill);
  }

  async function _showSkillDetail(skill) {
    // Hide document views, show skill detail
    previewWelcome.classList.add("hidden");
    previewContent.classList.add("hidden");
    skillDetailPane.classList.remove("hidden");

    // Hide document breadcrumb
    breadcrumbEl.classList.add("hidden");

    // Build detail HTML
    // Choose a suitable extraction command depending on the user's OS. On Windows we
    // recommend using PowerShell's Expand-Archive or the built-in explorer context
    // menu, and the target directory is under %USERPROFILE% instead of ~/.
    const isWindows = navigator.platform.startsWith("Win") || navigator.userAgent.includes("Windows");
    const installCmd = isWindows
      ? `powershell -Command "Expand-Archive -Path '${skill.skill_name}.zip' -DestinationPath $env:USERPROFILE\\.agents\\skills\\"`
      : `unzip ${skill.skill_name}.zip -d ~/.agents/skills/`;
    const filesList = (skill.files || []).map(f => `<li class="text-xs text-gray-600 dark:text-gray-400 py-0.5 flex items-center gap-1.5">
      <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
      ${_esc(f)}</li>`).join("");

    skillDetailPane.innerHTML = `
      <div class="max-w-4xl mx-auto px-6 md:px-10 py-8">
        <!-- Header -->
        <div class="flex items-start gap-4 mb-6">
          <div class="flex items-center justify-center w-14 h-14 rounded-2xl shrink-0 bg-gradient-to-br from-violet-500/20 to-blue-500/20 dark:from-violet-500/30 dark:to-blue-500/30">
            <svg class="w-7 h-7 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg>
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${_esc(skill.name || skill.skill_name)}</h1>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-sm text-gray-500 dark:text-gray-400">by ${_esc(skill.author)}</span>
              ${skill.uploaded_at ? `<span class="text-xs text-gray-400 dark:text-gray-500">· ${_formatDate(skill.uploaded_at)}</span>` : ""}
            </div>
            ${skill.description ? `<p class="text-sm text-gray-600 dark:text-gray-400 mt-2">${_esc(skill.description)}</p>` : ""}
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex flex-wrap gap-3 mt-6 mb-8">
          <button class="skill-like-btn inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border ${_isLiked(skill.author, skill.skill_name) ? "border-pink-300 dark:border-pink-700 text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"} transition-colors">
            <svg class="w-4 h-4" fill="${_isLiked(skill.author, skill.skill_name) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V2.75a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.25M6.633 10.25H5.25a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h1.383z"/></svg>
            いいね
            <span class="skill-like-count font-semibold">${skill.likes || 0}</span>
          </button>
          <a href="/api/skills/${encodeURIComponent(skill.author)}/${encodeURIComponent(skill.skill_name)}/download"
             class="skill-download-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all duration-150"
             style="background:#3b82f6;box-shadow:0 4px 14px rgba(59,130,246,0.35)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            ZIPダウンロード
          </a>
          <button class="skill-delete-btn inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  data-author="${_esc(skill.author)}" data-skill-name="${_esc(skill.skill_name)}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
            削除
          </button>
        </div>

        <!-- Install instructions -->
        <div class="mb-8 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"/></svg>
            インストール手順
          </h3>
          <ol class="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
            <li>上の「ZIPダウンロード」ボタンでZIPファイルを取得</li>
            <li>ダウンロードしたZIPを展開します。</li>
            ${isWindows ? `
            <li>エクスプローラーで右クリックして「すべて展開」を選び、展開先に
                <code class="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">%USERPROFILE%\\.agents\\skills\\</code>
                を指定するか、PowerShellで以下を実行してください:
            </li>
            ` : `
            <li>以下のコマンドで <code class="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">~/.agents/skills/</code> に展開:</li>
            `}
          </ol>
          <div class="mt-2 flex items-center gap-2">
            <code class="skill-install-cmd flex-1 text-xs px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-950 text-green-400 font-mono select-all overflow-x-auto">${_esc(installCmd)}</code>
            <button class="skill-copy-cmd shrink-0 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="コマンドをコピー">
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>
            </button>
          </div>
        </div>

        <!-- SKILL.md content -->
        <div id="skill-md-content" class="markdown-body">
          <div class="flex items-center justify-center py-8 text-gray-400">
            <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            読み込み中...
          </div>
        </div>

        <!-- Files list -->
        ${skill.files && skill.files.length ? `
        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>
            ファイル構成
          </h3>
          <ul class="space-y-0.5">${filesList}</ul>
        </div>
        ` : ""}
      </div>
    `;

    // Wire up like button
    const likeBtn = skillDetailPane.querySelector(".skill-like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", () => _likeSkill(skill.author, skill.skill_name));
    }

    // Wire up copy button
    const copyBtn = skillDetailPane.querySelector(".skill-copy-cmd");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(installCmd).then(() => {
          copyBtn.innerHTML = `<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/></svg>`;
          }, 2000);
        });
      });
    }

    // Wire up delete button
    const deleteBtn = skillDetailPane.querySelector(".skill-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        _showDeleteDialog(skill);
      });
    }

    // Load and render SKILL.md
    _loadSkillMd(skill);
  }

  async function _loadSkillMd(skill) {
    const mdEl = document.getElementById("skill-md-content");
    if (!mdEl) return;

    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.author)}/${encodeURIComponent(skill.skill_name)}/file/SKILL.md`);
      if (!res.ok) {
        mdEl.innerHTML = `<p class="text-gray-400 text-sm">SKILL.md が見つかりません</p>`;
        return;
      }
      const text = await res.text();

      // Strip frontmatter for display
      const stripped = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

      const markedLib = (typeof marked === "object" && marked.parse) ? marked : null;
      if (markedLib) {
        mdEl.innerHTML = markedLib.parse(stripped);
        // Highlight code blocks
        mdEl.querySelectorAll("pre code").forEach(el => {
          try { hljs.highlightElement(el); } catch (_) {}
        });
        // Render mermaid
        const mermaidDivs = mdEl.querySelectorAll("div.mermaid");
        if (mermaidDivs.length && typeof mermaid !== "undefined") {
          mermaidDivs.forEach((div, i) => { div.id = `skill-mermaid-${Date.now()}-${i}`; });
          try { await mermaid.run({ nodes: mermaidDivs }); } catch (_) {}
        }
      } else {
        mdEl.textContent = stripped;
      }
    } catch (err) {
      console.error("Failed to load SKILL.md:", err);
      mdEl.innerHTML = `<p class="text-red-500 text-sm">読み込みに失敗しました</p>`;
    }
  }

  /* ---- Delete dialog ---- */

  function _showDeleteDialog(skill) {
    const dialog = document.getElementById("skill-delete-dialog");
    const msg = document.getElementById("skill-delete-dialog-msg");
    const pathText = document.getElementById("skill-delete-dialog-path-text");
    const confirmBtn = document.getElementById("skill-delete-dialog-confirm");
    const cancelBtn = document.getElementById("skill-delete-dialog-cancel");

    msg.innerHTML = `スキル<strong class="text-gray-900 dark:text-gray-100">「${_esc(skill.name || skill.skill_name)}」</strong>を削除しますか？`;
    pathText.textContent = `${skill.author}/${skill.skill_name}`;
    dialog.classList.remove("hidden");

    // Replace listeners to avoid duplicates
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newCancel.addEventListener("click", () => dialog.classList.add("hidden"));
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.classList.contains("dialog-overlay")) dialog.classList.add("hidden");
    });

    newConfirm.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skill.author)}/${encodeURIComponent(skill.skill_name)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "削除に失敗しました");
        } else {
          _selectedSkill = null;
          showWelcome();
          await load();
        }
      } catch (err) {
        console.error("Delete skill error:", err);
        alert("削除中にエラーが発生しました");
      }
      dialog.classList.add("hidden");
    });
  }

  /* ---- Search ---- */

  let _searchTimeout = null;
  if (skillsSearch) {
    skillsSearch.addEventListener("input", () => {
      clearTimeout(_searchTimeout);
      _searchTimeout = setTimeout(() => {
        load(skillsSearch.value.trim());
      }, 300);
    });
  }

  /* ---- Public ---- */

  function showWelcome() {
    _selectedSkill = null;
    skillDetailPane.classList.add("hidden");
    previewContent.classList.add("hidden");
    previewWelcome.classList.remove("hidden");
    breadcrumbEl.classList.add("hidden");
  }

  function isActive() {
    // Check if skills tab is currently active
    const tab = document.getElementById("tab-skills");
    return tab && tab.classList.contains("tab-active");
  }

  function getSelectedSkill() {
    return _selectedSkill;
  }

  function hide() {
    // Hide skills-specific UI elements
    skillDetailPane.classList.add("hidden");
  }

  return { load, showWelcome, isActive, getSelectedSkill, hide };
})();
