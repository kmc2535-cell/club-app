(() => {
  const STORAGE_KEY = "profile-site-state-v2";
  const BASELINE_KEY = "profile-site-baseline-v1";
  const PHOTO_KEY = "profile-site-photo-v1";
  const BASELINE_PHOTO_KEY = "profile-site-baseline-photo-v1";
  const PHOTO_PLACEHOLDER = "__PROFILE_PHOTO__";
  const HOTKEY = "Command + Shift + Control + H";
  const siteRoot = document.getElementById("site-root");
  const runtimeStyle = document.getElementById("runtime-style");
  const quickPhotoInput = document.getElementById("quick-photo-input");
  const defaultProfileSrc =
    siteRoot?.querySelector(".profile-photo")?.getAttribute("src") || "";

  if (!siteRoot || !runtimeStyle) return;

  const toolbar = document.createElement("section");
  toolbar.className = "editor-toolbar hidden";
  toolbar.setAttribute("aria-label", "Visual editor toolbar");
  toolbar.innerHTML = `
    <h4>Edit Mode</h4>
    <p>Toggle: ${HOTKEY}<br />Click an element to edit text, image, style, and layout.</p>
    <p id="editor-target" class="small">Selected: none</p>

    <textarea id="editor-text" placeholder="Text content"></textarea>
    <div class="editor-row">
      <button id="apply-text" type="button">Apply Text</button>
      <button id="apply-html" type="button" class="secondary">Apply HTML</button>
    </div>

    <div class="editor-row">
      <input id="style-prop" type="text" placeholder="CSS prop (e.g. margin-top)" />
      <input id="style-value" type="text" placeholder="value (e.g. 24px)" />
    </div>
    <div class="editor-row">
      <button id="apply-style" type="button">Apply Style</button>
      <button id="clear-style" type="button" class="secondary">Clear Style Prop</button>
    </div>

    <div class="editor-row">
      <input id="image-url" type="url" placeholder="Image URL (for img)" />
      <input id="image-file" type="file" accept="image/*" />
    </div>

    <div class="editor-row three">
      <button id="move-up" type="button">Move Up</button>
      <button id="move-down" type="button">Move Down</button>
      <button id="duplicate" type="button" class="secondary">Duplicate</button>
    </div>

    <div class="editor-row">
      <button id="delete-node" type="button" class="secondary">Delete</button>
      <button id="save-edit" type="button">Save</button>
    </div>

    <div class="editor-row three">
      <button id="export-edit" type="button" class="secondary">Export</button>
      <button id="reset-edit" type="button" class="secondary">Reset</button>
      <button id="close-edit" type="button">Exit</button>
    </div>
  `;

  document.body.appendChild(toolbar);

  const ui = {
    target: toolbar.querySelector("#editor-target"),
    text: toolbar.querySelector("#editor-text"),
    styleProp: toolbar.querySelector("#style-prop"),
    styleValue: toolbar.querySelector("#style-value"),
    imageUrl: toolbar.querySelector("#image-url"),
    imageFile: toolbar.querySelector("#image-file"),
    applyText: toolbar.querySelector("#apply-text"),
    applyHtml: toolbar.querySelector("#apply-html"),
    applyStyle: toolbar.querySelector("#apply-style"),
    clearStyle: toolbar.querySelector("#clear-style"),
    moveUp: toolbar.querySelector("#move-up"),
    moveDown: toolbar.querySelector("#move-down"),
    duplicate: toolbar.querySelector("#duplicate"),
    deleteNode: toolbar.querySelector("#delete-node"),
    save: toolbar.querySelector("#save-edit"),
    exportBtn: toolbar.querySelector("#export-edit"),
    reset: toolbar.querySelector("#reset-edit"),
    close: toolbar.querySelector("#close-edit"),
  };

  let isEditing = false;
  let selected = null;
  const inlineTextTags = new Set([
    "H1",
    "H2",
    "H3",
    "P",
    "LI",
    "A",
    "STRONG",
    "SPAN",
    "TIME",
  ]);

  function editableNodes() {
    return siteRoot.querySelectorAll("h1,h2,h3,p,li,a,strong,span,time");
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = migrateLegacyState(JSON.parse(raw));
      if (payload?.rootHtml) siteRoot.innerHTML = payload.rootHtml;
      runtimeStyle.textContent = payload?.runtimeCss || "";
      stripEditorArtifacts(siteRoot);
    } catch (_err) {
      // no-op
    }
  }

  function migrateLegacyState(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (typeof payload.rootHtml !== "string") return payload;

    let nextHtml = payload.rootHtml;
    let changed = false;

    const swaps = [
      ["https://github.com/your-username", "https://github.com/1haruma7"],
      ["@your-username", "@1haruma7"],
      ["https://x.com/your-handle", "https://x.com/nori47haru"],
      ["@your-handle", "@nori47haru"],
    ];

    swaps.forEach(([from, to]) => {
      if (nextHtml.includes(from)) {
        nextHtml = nextHtml.split(from).join(to);
        changed = true;
      }
    });

    if (!changed) return payload;

    const nextPayload = { ...payload, rootHtml: nextHtml };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPayload));
    } catch (_err) {
      // no-op
    }
    return nextPayload;
  }

  function readPhotoState() {
    try {
      const img = siteRoot.querySelector(".profile-photo");
      if (!img) return;
      const photo = localStorage.getItem(PHOTO_KEY);
      if (!photo) {
        if (img.getAttribute("src") === PHOTO_PLACEHOLDER) {
          img.setAttribute("src", defaultProfileSrc);
        }
        const currentSrc = img.getAttribute("src") || "";
        syncPhotoUploadVisibility(Boolean(currentSrc) && currentSrc !== PHOTO_PLACEHOLDER);
        return;
      }
      img.setAttribute("src", photo);
      syncPhotoUploadVisibility(true);
    } catch (_err) {
      // no-op
    }
  }

  function normalizeSocialLinks() {
    const heroGithub = siteRoot.querySelector('.hero-actions a[href*="github.com"]');
    if (heroGithub) {
      const href = heroGithub.getAttribute("href") || "";
      if (href.includes("your-username")) {
        heroGithub.setAttribute("href", "https://github.com/1haruma7");
      }
    }

    const contactLinks = siteRoot.querySelectorAll("#contact a");
    contactLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (href.includes("github.com/your-username")) {
        link.setAttribute("href", "https://github.com/1haruma7");
        link.textContent = "@1haruma7";
      }
      if (href.includes("x.com/your-handle")) {
        link.setAttribute("href", "https://x.com/nori47haru");
        link.textContent = "@nori47haru";
      }
    });
  }

  function rootHtmlForStorage() {
    const clone = siteRoot.cloneNode(true);
    stripEditorArtifacts(clone);
    const profile = clone.querySelector(".profile-photo");
    if (profile && localStorage.getItem(PHOTO_KEY)) {
      profile.setAttribute("src", PHOTO_PLACEHOLDER);
    }
    return clone.innerHTML;
  }

  function stripEditorArtifacts(root) {
    root.querySelectorAll(".editor-selected").forEach((node) => {
      node.classList.remove("editor-selected");
    });
    root.querySelectorAll("[contenteditable]").forEach((node) => {
      node.removeAttribute("contenteditable");
    });
  }

  function saveState() {
    const payload = {
      rootHtml: rootHtmlForStorage(),
      runtimeCss: runtimeStyle.textContent,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      saveBaselineFromCurrent();
      ui.target.textContent = "Saved changes.";
    } catch (_err) {
      ui.target.textContent = "Save failed: storage is full.";
    }
  }

  function saveBaselineFromCurrent() {
    const payload = {
      rootHtml: rootHtmlForStorage(),
      runtimeCss: runtimeStyle.textContent,
    };

    try {
      localStorage.setItem(BASELINE_KEY, JSON.stringify(payload));
      const profile = siteRoot.querySelector(".profile-photo");
      const src = profile?.getAttribute("src") || "";
      if (src && src !== PHOTO_PLACEHOLDER) {
        localStorage.setItem(BASELINE_PHOTO_KEY, src);
      } else {
        localStorage.removeItem(BASELINE_PHOTO_KEY);
      }
    } catch (_err) {
      // no-op
    }
  }

  function fileToOptimizedDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Image read failed."));
          return;
        }
        const img = new Image();
        img.onload = () => {
          const maxSide = 900;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas init failed."));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.84));
        };
        img.onerror = () => reject(new Error("Image decode failed."));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Image read failed."));
      reader.readAsDataURL(file);
    });
  }

  function applyProfilePhoto(dataUrl) {
    const img = siteRoot.querySelector(".profile-photo");
    if (!img) return;
    img.setAttribute("src", dataUrl);
    try {
      localStorage.setItem(PHOTO_KEY, dataUrl);
      syncPhotoUploadVisibility(true);
    } catch (_err) {
      ui.target.textContent = "Photo save failed: storage is full.";
      return;
    }
    saveState();
  }

  function syncPhotoUploadVisibility(hasPhoto) {
    siteRoot.classList.toggle("has-profile-photo", hasPhoto);
  }

  function applyImageToNode(node, file) {
    if (!node || !file || node.tagName !== "IMG") return;
    fileToOptimizedDataUrl(file)
      .then((dataUrl) => {
        node.setAttribute("src", dataUrl);
        if (node.classList.contains("profile-photo")) {
          localStorage.setItem(PHOTO_KEY, dataUrl);
          syncPhotoUploadVisibility(true);
        }
        saveState();
      })
      .catch(() => {
        ui.target.textContent = "Image update failed.";
      });
  }

  function resetState() {
    const baselineRaw = localStorage.getItem(BASELINE_KEY);
    if (baselineRaw) {
      localStorage.setItem(STORAGE_KEY, baselineRaw);
      const baselinePhoto = localStorage.getItem(BASELINE_PHOTO_KEY);
      if (baselinePhoto) {
        localStorage.setItem(PHOTO_KEY, baselinePhoto);
      } else {
        localStorage.removeItem(PHOTO_KEY);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PHOTO_KEY);
    }
    syncPhotoUploadVisibility(false);
    location.reload();
  }

  function exportState() {
    const html = "<!doctype html>\n" + document.documentElement.outerHTML;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "profile-site-edited.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function selectorFor(node) {
    if (!node) return "none";
    if (node.id) return `#${node.id}`;
    const cls = [...node.classList].filter(Boolean);
    if (cls.length) return `${node.tagName.toLowerCase()}.${cls.join(".")}`;
    return node.tagName.toLowerCase();
  }

  function setSelected(node) {
    if (selected) selected.classList.remove("editor-selected");
    selected = node;
    if (!selected) {
      ui.target.textContent = "Selected: none";
      ui.text.value = "";
      ui.imageUrl.value = "";
      return;
    }

    selected.classList.add("editor-selected");
    ui.target.textContent = `Selected: ${selectorFor(selected)}`;
    ui.text.value = selected.textContent || "";
    ui.imageUrl.value = selected.tagName === "IMG" ? selected.getAttribute("src") || "" : "";
  }

  function applyContentEditable(on) {
    editableNodes().forEach((node) => {
      if (on) {
        node.setAttribute("contenteditable", "true");
      } else {
        node.removeAttribute("contenteditable");
      }
    });
  }

  function toggleEditMode(next) {
    isEditing = next;
    toolbar.classList.toggle("hidden", !isEditing);
    document.body.classList.toggle("is-editing", isEditing);
    applyContentEditable(isEditing);

    if (!isEditing) {
      setSelected(null);
      stripEditorArtifacts(siteRoot);
    } else {
      ui.target.textContent = "Selected: none";
    }
  }

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (event.metaKey && event.ctrlKey && event.shiftKey && key === "h") {
      event.preventDefault();
      toggleEditMode(!isEditing);
      return;
    }

    if (isEditing && key === "escape") {
      event.preventDefault();
      toggleEditMode(false);
    }
  });

  siteRoot.addEventListener("click", (event) => {
    if (!isEditing) return;

    const link = event.target.closest("a");
    if (link) event.preventDefault();

    const node = event.target.closest("*");
    if (!node || !siteRoot.contains(node)) return;
    if (node === siteRoot) return;

    setSelected(node);
  });

  siteRoot.addEventListener("input", (event) => {
    if (!isEditing || !selected) return;
    if (selected.contains(event.target) || selected === event.target) {
      ui.text.value = selected.textContent || "";
    }
  });

  toolbar.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  ui.applyText.addEventListener("click", () => {
    if (!selected) return;
    if (!inlineTextTags.has(selected.tagName)) {
      ui.target.textContent = "Text edit is for text elements only.";
      return;
    }
    selected.textContent = ui.text.value;
  });

  ui.applyHtml.addEventListener("click", () => {
    if (!selected) return;
    if (!inlineTextTags.has(selected.tagName)) {
      ui.target.textContent = "HTML edit is for text elements only.";
      return;
    }
    selected.innerHTML = ui.text.value;
  });

  ui.applyStyle.addEventListener("click", () => {
    if (!selected) return;
    const prop = ui.styleProp.value.trim();
    const value = ui.styleValue.value.trim();
    if (!prop || !value) return;
    selected.style.setProperty(prop, value);
  });

  ui.clearStyle.addEventListener("click", () => {
    if (!selected) return;
    const prop = ui.styleProp.value.trim();
    if (!prop) return;
    selected.style.removeProperty(prop);
  });

  ui.imageUrl.addEventListener("change", () => {
    if (!selected || selected.tagName !== "IMG") return;
    selected.setAttribute("src", ui.imageUrl.value.trim());
  });

  ui.imageFile.addEventListener("change", () => {
    if (!selected || selected.tagName !== "IMG") return;
    const file = ui.imageFile.files && ui.imageFile.files[0];
    if (!file) return;
    applyImageToNode(selected, file);
  });

  if (quickPhotoInput) {
    quickPhotoInput.addEventListener("change", () => {
      const file = quickPhotoInput.files && quickPhotoInput.files[0];
      if (!file) return;
      fileToOptimizedDataUrl(file)
        .then((dataUrl) => {
          applyProfilePhoto(dataUrl);
        })
        .catch(() => {
          ui.target.textContent = "Photo update failed.";
        });
    });
  }

  ui.moveUp.addEventListener("click", () => {
    if (!selected || !selected.parentElement) return;
    const prev = selected.previousElementSibling;
    if (!prev) return;
    selected.parentElement.insertBefore(selected, prev);
  });

  ui.moveDown.addEventListener("click", () => {
    if (!selected || !selected.parentElement) return;
    const next = selected.nextElementSibling;
    if (!next) return;
    selected.parentElement.insertBefore(next, selected);
  });

  ui.duplicate.addEventListener("click", () => {
    if (!selected || !selected.parentElement) return;
    const clone = selected.cloneNode(true);
    selected.parentElement.insertBefore(clone, selected.nextSibling);
  });

  ui.deleteNode.addEventListener("click", () => {
    if (!selected || !selected.parentElement) return;
    const node = selected;
    setSelected(null);
    node.remove();
  });

  ui.save.addEventListener("click", saveState);
  ui.exportBtn.addEventListener("click", exportState);
  ui.reset.addEventListener("click", resetState);
  ui.close.addEventListener("click", () => toggleEditMode(false));

  readState();
  readPhotoState();
  normalizeSocialLinks();
  saveBaselineFromCurrent();
})();
